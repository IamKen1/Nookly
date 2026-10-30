import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/session";
import { hasPermission } from "@/lib/permissions";
import { requireFeature } from "@/lib/plan-gating";
import { invalidateCached } from "@/lib/route-cache";
import { parsePendingItems } from "@/lib/pending-orders";
import { batchesAtStore } from "@/lib/branch-scope";

class TransferError extends Error {}

// Recent transfers into or out of the current branch. Each transfer is a pair
// of TRANSFER stock movements (out of one branch, into another) that share a
// TR- reference, so they're grouped back together here.
export async function GET(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const movements = await prisma.stockMovement.findMany({
    where: { tenantId: session.tenantId, type: "TRANSFER", reference: { startsWith: "TR-" } },
    include: {
      store: { select: { id: true, name: true } },
      product: { select: { name: true } },
      user: { select: { firstName: true, lastName: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  const byRef = new Map<
    string,
    { reference: string; createdAt: string; by: string; notes: string | null; from: string; to: string; fromId: string; toId: string; items: { name: string; quantity: number }[] }
  >();
  for (const m of movements) {
    const ref = m.reference!;
    const entry = byRef.get(ref) ?? {
      reference: ref,
      createdAt: m.createdAt.toISOString(),
      by: `${m.user.firstName} ${m.user.lastName}`.trim(),
      notes: m.notes,
      from: "",
      to: "",
      fromId: "",
      toId: "",
      items: [],
    };
    if (m.quantity < 0) {
      entry.from = m.store.name;
      entry.fromId = m.store.id;
      entry.items.push({ name: m.product.name, quantity: -m.quantity });
    } else {
      entry.to = m.store.name;
      entry.toId = m.store.id;
    }
    byRef.set(ref, entry);
  }

  const transfers = [...byRef.values()].filter((t) => t.fromId === session.storeId || t.toId === session.storeId).slice(0, 50);
  return NextResponse.json(transfers);
}

export async function POST(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.storeId) return NextResponse.json({ error: "No branch assigned to this account." }, { status: 400 });
  if (!(await hasPermission(session.tenantId, session.role, "inventory_adjust"))) {
    return NextResponse.json({ error: "You don't have permission to move stock." }, { status: 403 });
  }
  const gate = await requireFeature(session.tenantId, "multiBranch");
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const body = await request.json();
  const toStoreId = typeof body.toStoreId === "string" ? body.toStoreId : "";
  const notes = typeof body.notes === "string" ? body.notes.trim() : "";
  const items = parsePendingItems(body.items);
  if (items.length === 0) return NextResponse.json({ error: "Add at least one product to transfer." }, { status: 400 });
  if (new Set(items.map((i) => i.productId)).size !== items.length) {
    return NextResponse.json({ error: "Each product can only appear once per transfer." }, { status: 400 });
  }
  if (toStoreId === session.storeId) return NextResponse.json({ error: "Choose a different branch to send to." }, { status: 400 });

  const [fromStore, toStore] = await Promise.all([
    prisma.store.findFirst({ where: { id: session.storeId, tenantId: session.tenantId }, select: { id: true, name: true } }),
    prisma.store.findFirst({ where: { id: toStoreId, tenantId: session.tenantId, isActive: true }, select: { id: true, name: true } }),
  ]);
  if (!fromStore || !toStore) return NextResponse.json({ error: "Branch not found." }, { status: 404 });

  const products = await prisma.product.findMany({
    where: { id: { in: items.map((i) => i.productId) }, tenantId: session.tenantId },
    select: { id: true, name: true },
  });
  const productNames = new Map(products.map((p) => [p.id, p.name]));
  if (productNames.size !== items.length) return NextResponse.json({ error: "One of the products no longer exists." }, { status: 400 });

  const reference = `TR-${Date.now().toString(36).toUpperCase()}`;
  const sourceBatchWhere = await batchesAtStore(session.tenantId, fromStore.id);

  try {
    await prisma.$transaction(
      async (tx) => {
        for (const item of items) {
          // Conditional decrement: fails cleanly instead of going negative if
          // stock changed (e.g. a sale) after the user opened the form.
          const taken = await tx.productStock.updateMany({
            where: { productId: item.productId, storeId: fromStore.id, currentStock: { gte: item.quantity } },
            data: { currentStock: { decrement: item.quantity } },
          });
          if (taken.count !== 1) throw new TransferError(`Not enough stock of ${productNames.get(item.productId)} at ${fromStore.name}.`);

          await tx.productStock.upsert({
            where: { productId_storeId: { productId: item.productId, storeId: toStore.id } },
            update: { currentStock: { increment: item.quantity } },
            create: { productId: item.productId, storeId: toStore.id, currentStock: item.quantity },
          });

          // Batches travel with the stock, soonest-expiring first (the same
          // order FEFO sells in), so expiry tracking stays right at both
          // branches. Products without tracked batches only move the count above.
          const batches = await tx.productBatch.findMany({
            where: { productId: item.productId, quantity: { gt: 0 }, ...sourceBatchWhere },
            orderBy: [{ expirationDate: "asc" }, { receivedDate: "asc" }],
          });
          let remaining = item.quantity;
          for (const batch of batches) {
            if (remaining <= 0) break;
            const move = Math.min(batch.quantity, remaining);
            await tx.productBatch.update({ where: { id: batch.id }, data: { quantity: { decrement: move } } });
            await tx.productBatch.upsert({
              where: { productId_storeId_batchNumber: { productId: item.productId, storeId: toStore.id, batchNumber: batch.batchNumber } },
              update: { quantity: { increment: move } },
              create: {
                productId: item.productId,
                storeId: toStore.id,
                batchNumber: batch.batchNumber,
                expirationDate: batch.expirationDate,
                costPrice: batch.costPrice,
                quantity: move,
              },
            });
            remaining -= move;
          }
        }

        await tx.stockMovement.createMany({
          data: items.flatMap((item) => [
            {
              tenantId: session.tenantId,
              storeId: fromStore.id,
              productId: item.productId,
              type: "TRANSFER" as const,
              quantity: -item.quantity,
              reason: `Transfer to ${toStore.name}`,
              reference,
              notes: notes || null,
              userId: session.userId,
            },
            {
              tenantId: session.tenantId,
              storeId: toStore.id,
              productId: item.productId,
              type: "TRANSFER" as const,
              quantity: item.quantity,
              reason: `Transfer from ${fromStore.name}`,
              reference,
              notes: notes || null,
              userId: session.userId,
            },
          ]),
        });
      },
      { timeout: 30000, maxWait: 10000 }
    );
  } catch (error) {
    if (error instanceof TransferError) return NextResponse.json({ error: error.message }, { status: 409 });
    throw error;
  }

  invalidateCached(`products:${session.tenantId}`);
  return NextResponse.json({ reference, from: fromStore.name, to: toStore.name, itemCount: items.length }, { status: 201 });
}
