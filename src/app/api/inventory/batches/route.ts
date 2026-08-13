import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/session";
import { runInBackground } from "@/lib/background";
import { notifyStockThresholdReached } from "@/lib/notifications";
import { invalidateCached } from "@/lib/route-cache";

export async function GET(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const productId = searchParams.get("productId");
  const nearExpiry = searchParams.get("nearExpiry") === "true";
  const days = Math.max(1, Math.min(365, Number(searchParams.get("days") || "90")));

  if (productId) {
    const product = await prisma.product.findFirst({ where: { id: productId, tenantId: session.tenantId } });
    if (!product) return NextResponse.json({ error: "Product not found." }, { status: 404 });

    const batches = await prisma.productBatch.findMany({
      where: { productId },
      orderBy: { expirationDate: "asc" },
    });
    return NextResponse.json(batches);
  }

  const now = new Date();
  const windowEnd = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

  const batches = await prisma.productBatch.findMany({
    where: {
      quantity: { gt: 0 },
      expirationDate: nearExpiry ? { lte: windowEnd } : undefined,
      product: { tenantId: session.tenantId },
    },
    include: { product: { select: { id: true, name: true, barcode: true, category: { select: { name: true } } } } },
    orderBy: { expirationDate: "asc" },
    take: 200,
  });

  return NextResponse.json(
    batches.map((b) => ({
      ...b,
      isExpired: b.expirationDate < now,
      isExpiringSoon: b.expirationDate >= now && b.expirationDate <= windowEnd,
    }))
  );
}

export async function POST(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.storeId) return NextResponse.json({ error: "No branch assigned to this account." }, { status: 400 });

  const body = await request.json();
  const { productId, batchNumber, expirationDate, quantity, costPrice, reason } = body as {
    productId: string;
    batchNumber: string;
    expirationDate: string;
    quantity: number;
    costPrice: number;
    reason?: string;
  };

  if (!productId || !batchNumber || !expirationDate || !quantity || quantity <= 0 || costPrice == null) {
    return NextResponse.json(
      { error: "productId, batchNumber, expirationDate, quantity (>0) and costPrice are required." },
      { status: 400 }
    );
  }

  const product = await prisma.product.findFirst({
    where: { id: productId, tenantId: session.tenantId },
    include: { category: { select: { name: true } } },
  });
  if (!product) return NextResponse.json({ error: "Product not found." }, { status: 404 });

  try {
    const result = await prisma.$transaction(async (tx) => {
      const batch = await tx.productBatch.create({
        data: {
          productId,
          batchNumber,
          expirationDate: new Date(expirationDate),
          quantity,
          costPrice,
        },
      });

      const stock = await tx.productStock.findUnique({
        where: { productId_storeId: { productId, storeId: session.storeId! } },
      });
      const previousStock = stock?.currentStock ?? 0;
      const updatedStock = await tx.productStock.upsert({
        where: { productId_storeId: { productId, storeId: session.storeId! } },
        update: { currentStock: { increment: quantity } },
        create: { productId, storeId: session.storeId!, currentStock: quantity },
      });

      await tx.stockMovement.create({
        data: {
          tenantId: session.tenantId,
          storeId: session.storeId!,
          productId,
          type: "PURCHASE",
          quantity,
          reason: reason || `Batch ${batchNumber} received`,
          reference: batchNumber,
          userId: session.userId,
        },
      });

      return { batch, previousStock, currentStock: updatedStock.currentStock };
    });

    runInBackground(`stock notification for ${product.name}`, () =>
      notifyStockThresholdReached({
        tenantId: session.tenantId,
        productName: product.name,
        categoryName: product.category?.name,
        previousStock: result.previousStock,
        currentStock: result.currentStock,
        minimumStock: product.minimumStock,
        reason: `Batch ${batchNumber} received`,
      })
    );

    invalidateCached(`products:${session.tenantId}`);
    return NextResponse.json(result.batch, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "P2002") {
      return NextResponse.json({ error: "A batch with this number already exists for this product." }, { status: 409 });
    }
    console.error("Error creating batch", error);
    return NextResponse.json({ error: "Failed to receive batch." }, { status: 500 });
  }
}
