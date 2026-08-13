import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/session";

export async function GET(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search")?.trim();
  const categoryId = searchParams.get("categoryId");

  const products = await prisma.product.findMany({
    where: {
      tenantId: session.tenantId,
      isActive: true,
      ...(categoryId ? { categoryId } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { genericName: { contains: search, mode: "insensitive" } },
              { brandName: { contains: search, mode: "insensitive" } },
              { barcode: { contains: search } },
              { sku: { contains: search } },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      name: true,
      genericName: true,
      brandName: true,
      barcode: true,
      description: true,
      strength: true,
      dosageForm: true,
      costPrice: true,
      sellingPrice: true,
      minimumStock: true,
      maximumStock: true,
      reorderPoint: true,
      requiresPrescription: true,
      isVatable: true,
      isOTC: true,
      drugSchedule: true,
      imageUrl: true,
      category: { select: { id: true, name: true } },
      stocks: {
        where: session.storeId ? { storeId: session.storeId } : undefined,
        select: { currentStock: true },
      },
    },
    orderBy: { name: "asc" },
  });

  const withStock = products.map((product) => ({
    ...product,
    currentStock: product.stocks[0]?.currentStock ?? 0,
  }));

  return NextResponse.json(withStock);
}

export async function POST(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.storeId) return NextResponse.json({ error: "No branch assigned to this account." }, { status: 400 });

  const body = await request.json();
  const {
    name,
    genericName,
    brandName,
    barcode,
    description,
    strength,
    dosageForm,
    manufacturer,
    costPrice,
    sellingPrice,
    insurancePrice,
    currentStock,
    minimumStock,
    maximumStock,
    reorderPoint,
    requiresPrescription,
    isOTC,
    isVatable,
    categoryId,
    drugSchedule,
    imageUrl,
    batchNumber,
    expirationDate,
  }: {
    name: string;
    genericName?: string;
    brandName?: string;
    barcode?: string;
    description?: string;
    strength?: string;
    dosageForm?: string;
    manufacturer?: string;
    costPrice: number;
    sellingPrice: number;
    insurancePrice?: number;
    currentStock?: number;
    minimumStock?: number;
    maximumStock?: number;
    reorderPoint?: number;
    requiresPrescription?: boolean;
    isOTC?: boolean;
    isVatable?: boolean;
    categoryId: string;
    drugSchedule?: string;
    imageUrl?: string;
    batchNumber?: string;
    expirationDate?: string;
  } = body;

  if (!name || !categoryId || costPrice == null || sellingPrice == null) {
    return NextResponse.json(
      { error: "name, categoryId, costPrice and sellingPrice are required." },
      { status: 400 }
    );
  }

  const trimmedBatchNumber = typeof batchNumber === "string" ? batchNumber.trim() : "";
  if (Boolean(trimmedBatchNumber) !== Boolean(expirationDate)) {
    return NextResponse.json(
      { error: "Provide both a batch number and an expiration date, or leave both blank." },
      { status: 400 }
    );
  }
  if (trimmedBatchNumber && (!currentStock || currentStock <= 0)) {
    return NextResponse.json({ error: "A batch requires starting stock greater than zero." }, { status: 400 });
  }

  const [plan, productCount] = await Promise.all([
    prisma.subscription.findUnique({
      where: { tenantId: session.tenantId },
      include: { plan: true },
    }),
    prisma.product.count({ where: { tenantId: session.tenantId, isActive: true } }),
  ]);

  const maxProducts = plan?.plan.maxProducts ?? -1;
  if (maxProducts !== -1 && productCount >= maxProducts) {
    return NextResponse.json(
      { error: `You've reached the ${maxProducts}-product limit for the ${plan?.plan.name} plan. Upgrade to add more.` },
      { status: 403 }
    );
  }

  const category = await prisma.category.findFirst({
    where: { id: categoryId, tenantId: session.tenantId },
  });
  if (!category) {
    return NextResponse.json({ error: "Invalid category." }, { status: 400 });
  }

  const normalizedBarcode = typeof barcode === "string" ? barcode.trim() : "";

  try {
    const product = await prisma.product.create({
      data: {
        tenantId: session.tenantId,
        name,
        genericName: genericName || null,
        brandName: brandName || null,
        barcode: normalizedBarcode || null,
        description: description || null,
        strength: strength || null,
        dosageForm: dosageForm || null,
        manufacturer: manufacturer || null,
        costPrice,
        sellingPrice,
        insurancePrice: insurancePrice || null,
        minimumStock: minimumStock ?? 0,
        maximumStock: maximumStock ?? null,
        reorderPoint: reorderPoint ?? 0,
        requiresPrescription: Boolean(requiresPrescription),
        isOTC: isOTC ?? true,
        isVatable: isVatable ?? true,
        categoryId,
        drugSchedule: (drugSchedule || null) as never,
        imageUrl: imageUrl || null,
        stocks: {
          create: { storeId: session.storeId, currentStock: currentStock ?? 0 },
        },
        ...(trimmedBatchNumber
          ? {
              batches: {
                create: {
                  batchNumber: trimmedBatchNumber,
                  expirationDate: new Date(expirationDate!),
                  quantity: currentStock!,
                  costPrice,
                },
              },
            }
          : {}),
      },
      include: { category: true, stocks: true },
    });

    return NextResponse.json(product, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "P2002") {
      return NextResponse.json({ error: "A product with this barcode already exists." }, { status: 409 });
    }
    console.error("Error creating product", error);
    return NextResponse.json({ error: "Failed to create product." }, { status: 500 });
  }
}
