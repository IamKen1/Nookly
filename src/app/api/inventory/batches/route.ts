import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/session";
import { runInBackground } from "@/lib/background";
import { notifyStockThresholdReached } from "@/lib/notifications";
import { invalidateCached } from "@/lib/route-cache";
import { batchesAtStore } from "@/lib/branch-scope";
import { ReceivingError, receiveDelivery, validateReceiving } from "@/lib/receiving";
import { hasPermission } from "@/lib/permissions";

export async function GET(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasPermission(session.tenantId, session.role, "inventory"))) {
    return NextResponse.json({ error: "You don't have access to Inventory." }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const productId = searchParams.get("productId");
  // status=expiring (within `days`), expired, or all batches with stock (default).
  // nearExpiry=true is the older spelling of status=expiring.
  const status = searchParams.get("status") ?? (searchParams.get("nearExpiry") === "true" ? "expiring" : "all");
  const days = Math.max(1, Math.min(365, Number(searchParams.get("days") || "90")));
  const batchWhere = session.storeId ? await batchesAtStore(session.tenantId, session.storeId) : {};

  if (productId) {
    const product = await prisma.product.findFirst({ where: { id: productId, tenantId: session.tenantId } });
    if (!product) return NextResponse.json({ error: "Product not found." }, { status: 404 });

    const batches = await prisma.productBatch.findMany({
      where: { productId, ...batchWhere },
      include: { supplier: { select: { id: true, name: true } } },
      orderBy: { expirationDate: "asc" },
    });
    return NextResponse.json(batches);
  }

  const now = new Date();
  const windowEnd = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

  const batches = await prisma.productBatch.findMany({
    where: {
      quantity: { gt: 0 },
      expirationDate: status === "expiring" ? { lte: windowEnd } : status === "expired" ? { lt: now } : undefined,
      product: { tenantId: session.tenantId },
      ...batchWhere,
    },
    include: {
      product: { select: { id: true, name: true, barcode: true, category: { select: { name: true } } } },
      supplier: { select: { id: true, name: true } },
    },
    orderBy: { expirationDate: "asc" },
    take: 500,
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
  if (!(await hasPermission(session.tenantId, session.role, "inventory_adjust"))) {
    return NextResponse.json({ error: "You don't have permission to change stock." }, { status: 403 });
  }
  if (!session.storeId) return NextResponse.json({ error: "No branch assigned to this account." }, { status: 400 });

  const body = await request.json();
  const { productId, batchNumber, expirationDate, quantity, costPrice, reason, supplierId } = body as {
    supplierId?: string;
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

  // Recorded as a one-line delivery, so it appears under Receiving like any other.
  const input = {
    supplierId: supplierId || null,
    notes: reason || null,
    items: [{ productId, batchNumber, expirationDate: String(expirationDate).slice(0, 10), quantity: Number(quantity), unitCost: Number(costPrice) }],
  };
  try {
    const lines = await validateReceiving(session.tenantId, input);
    const supplier = supplierId
      ? await prisma.supplier.findFirst({ where: { id: supplierId, tenantId: session.tenantId }, select: { id: true, name: true } })
      : null;
    if (supplierId && !supplier) return NextResponse.json({ error: "Supplier not found." }, { status: 400 });
    const { receiving, stockChanges } = await receiveDelivery({ tenantId: session.tenantId, storeId: session.storeId, userId: session.userId, input, lines, supplier });

    const product = await prisma.product.findUnique({ where: { id: productId }, select: { name: true, minimumStock: true, category: { select: { name: true } } } });
    const change = stockChanges[0];
    runInBackground(`stock notification for ${change.name}`, () =>
      notifyStockThresholdReached({
        tenantId: session.tenantId,
        storeId: session.storeId,
        productName: change.name,
        categoryName: product?.category?.name,
        previousStock: change.previousStock,
        currentStock: change.currentStock,
        minimumStock: product?.minimumStock ?? 0,
        reason: `Batch ${batchNumber} received`,
      })
    );

    invalidateCached(`products:${session.tenantId}`);
    const batch = await prisma.productBatch.findFirst({ where: { productId, storeId: session.storeId, batchNumber } });
    return NextResponse.json({ ...batch, receivingNumber: receiving.receivingNumber }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof ReceivingError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("Error creating batch", error);
    return NextResponse.json({ error: "Failed to receive batch." }, { status: 500 });
  }
}
