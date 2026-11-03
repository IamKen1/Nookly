import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/session";
import { getCached, invalidateCached } from "@/lib/route-cache";
import { hasPermission } from "@/lib/permissions";
import type { Prisma } from "@prisma/client";
import { parsePage, parseProductSort, productPageIds } from "@/lib/product-list";
import { sellingBelowCostMessage } from "@/lib/price-rules";

const PRODUCT_SELECT = {
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
  suppliers: { select: { supplier: { select: { id: true, name: true } } }, take: 1 },
} satisfies Prisma.ProductSelect;

// Lists products. With ?limit (and ?offset, ?sort, ?dir) it returns one page
// as { rows, total } — what the big lists use, so a catalog of thousands never
// loads in one go. Without it, the plain array as before (?take caps it, for
// search boxes).
export async function GET(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search")?.trim() ?? "";
  const categoryId = searchParams.get("categoryId") ?? "";
  // The POS asks for only what this branch sells; management screens (Products,
  // Inventory) still list the whole catalog.
  const forSale = searchParams.get("forSale") === "1" && Boolean(session.storeId);
  // The POS grid can grow to a few hundred with "Load more"; other lists page by 50.
  const page = parsePage(searchParams, 600);
  const order = parseProductSort(searchParams);
  const take = searchParams.has("take") ? Math.min(200, Math.max(1, Math.trunc(Number(searchParams.get("take"))) || 50)) : undefined;

  const cacheKey = `products:${session.tenantId}:${session.storeId ?? ""}:${search}:${categoryId}:${forSale ? "sale" : "all"}:${
    page ? `${page.offset}-${page.limit}-${order.sort}-${order.dir}` : `t${take ?? ""}`
  }`;
  const result = await getCached(cacheKey, 3000, async () => {
    const where: Prisma.ProductWhereInput = {
      tenantId: session.tenantId,
      isActive: true,
      ...(forSale ? { NOT: { stocks: { some: { storeId: session.storeId!, isHidden: true } } } } : {}),
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
    };
    const select = {
      ...PRODUCT_SELECT,
      stocks: {
        where: session.storeId ? { storeId: session.storeId } : undefined,
        select: { currentStock: true, sellingPrice: true },
      },
    } satisfies Prisma.ProductSelect;

    const shape = (products: Prisma.ProductGetPayload<{ select: typeof select }>[]) =>
      products.map(({ suppliers, ...product }) => ({
        ...product,
        // The product's usual supplier (set on the product form), if any.
        supplier: suppliers[0]?.supplier ?? null,
        currentStock: product.stocks[0]?.currentStock ?? 0,
        // This branch's own price, if it has one. sellingPrice stays the base
        // price so editing a product never overwrites it with a branch price.
        branchPrice: session.storeId && product.stocks[0]?.sellingPrice != null ? Number(product.stocks[0].sellingPrice) : null,
      }));

    if (page) {
      const { ids, total } = await productPageIds(where, session.storeId ?? null, order, page.offset, page.limit);
      const found = await prisma.product.findMany({ where: { id: { in: ids } }, select });
      const byId = new Map(found.map((f) => [f.id, f]));
      return { rows: shape(ids.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []))), total };
    }

    return shape(await prisma.product.findMany({ where, select, orderBy: { name: "asc" }, ...(take ? { take } : {}) }));
  });

  return NextResponse.json(result);
}

export async function POST(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasPermission(session.tenantId, session.role, "products_edit"))) {
    return NextResponse.json({ error: "You don't have permission to edit products." }, { status: 403 });
  }
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
    supplierId,
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
    supplierId?: string;
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

  const belowCost = sellingBelowCostMessage(Number(costPrice), Number(sellingPrice));
  if (belowCost) return NextResponse.json({ error: belowCost }, { status: 400 });

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
  const supplier = supplierId
    ? await prisma.supplier.findFirst({ where: { id: supplierId, tenantId: session.tenantId }, select: { id: true } })
    : null;
  if (supplierId && !supplier) return NextResponse.json({ error: "Supplier not found." }, { status: 400 });

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
        ...(supplier ? { suppliers: { create: { supplierId: supplier.id } } } : {}),
        stocks: {
          create: { storeId: session.storeId, currentStock: currentStock ?? 0 },
        },
        ...(trimmedBatchNumber
          ? {
              batches: {
                create: {
                  storeId: session.storeId,
                  batchNumber: trimmedBatchNumber,
                  expirationDate: new Date(expirationDate!),
                  quantity: currentStock!,
                  costPrice,
                  supplierId: supplier?.id ?? null,
                },
              },
            }
          : {}),
      },
      include: { category: true, stocks: true },
    });

    invalidateCached(`products:${session.tenantId}`);
    return NextResponse.json(product, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "P2002") {
      return NextResponse.json({ error: "A product with this barcode already exists." }, { status: 409 });
    }
    console.error("Error creating product", error);
    return NextResponse.json({ error: "Failed to create product." }, { status: 500 });
  }
}
