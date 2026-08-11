import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/session";

async function loadOwnedBatch(id: string, tenantId: string) {
  const batch = await prisma.productBatch.findFirst({
    where: { id, product: { tenantId } },
    include: { product: true },
  });
  return batch;
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.storeId) return NextResponse.json({ error: "No branch assigned to this account." }, { status: 400 });

  const { id } = await params;
  const existing = await loadOwnedBatch(id, session.tenantId);
  if (!existing) return NextResponse.json({ error: "Batch not found." }, { status: 404 });

  const body = await request.json();
  const { quantity } = body as { quantity: number };
  if (quantity == null || quantity < 0) {
    return NextResponse.json({ error: "A valid non-negative quantity is required." }, { status: 400 });
  }

  const delta = quantity - existing.quantity;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const batch = await tx.productBatch.update({ where: { id }, data: { quantity } });

      if (delta !== 0) {
        const stock = await tx.productStock.findUnique({
          where: { productId_storeId: { productId: existing.productId, storeId: session.storeId! } },
        });
        const newStock = Math.max(0, (stock?.currentStock ?? 0) + delta);
        await tx.productStock.upsert({
          where: { productId_storeId: { productId: existing.productId, storeId: session.storeId! } },
          update: { currentStock: newStock },
          create: { productId: existing.productId, storeId: session.storeId!, currentStock: newStock },
        });
        await tx.stockMovement.create({
          data: {
            tenantId: session.tenantId,
            storeId: session.storeId!,
            productId: existing.productId,
            type: "ADJUSTMENT",
            quantity: delta,
            reason: `Batch ${existing.batchNumber} correction`,
            reference: existing.batchNumber,
            userId: session.userId,
          },
        });
      }

      return batch;
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error updating batch", error);
    return NextResponse.json({ error: "Failed to update batch." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.storeId) return NextResponse.json({ error: "No branch assigned to this account." }, { status: 400 });

  const { id } = await params;
  const existing = await loadOwnedBatch(id, session.tenantId);
  if (!existing) return NextResponse.json({ error: "Batch not found." }, { status: 404 });

  const { searchParams } = new URL(request.url);
  const movementType = searchParams.get("reason") === "damaged" ? "DAMAGED" : "EXPIRED";

  try {
    await prisma.$transaction(async (tx) => {
      if (existing.quantity > 0) {
        const stock = await tx.productStock.findUnique({
          where: { productId_storeId: { productId: existing.productId, storeId: session.storeId! } },
        });
        const newStock = Math.max(0, (stock?.currentStock ?? 0) - existing.quantity);
        await tx.productStock.upsert({
          where: { productId_storeId: { productId: existing.productId, storeId: session.storeId! } },
          update: { currentStock: newStock },
          create: { productId: existing.productId, storeId: session.storeId!, currentStock: 0 },
        });
        await tx.stockMovement.create({
          data: {
            tenantId: session.tenantId,
            storeId: session.storeId!,
            productId: existing.productId,
            type: movementType,
            quantity: -existing.quantity,
            reason: `Batch ${existing.batchNumber} discarded (${movementType.toLowerCase()})`,
            reference: existing.batchNumber,
            userId: session.userId,
          },
        });
      }

      await tx.productBatch.delete({ where: { id } });
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error discarding batch", error);
    return NextResponse.json({ error: "Failed to discard batch." }, { status: 500 });
  }
}
