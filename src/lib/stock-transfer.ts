import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { batchesAtStore } from "@/lib/branch-scope";
import type { PendingOrderItem } from "@/lib/pending-orders";

export class TransferError extends Error {}

type Branch = { id: string; name: string };

// Validates a branch-to-branch transfer before any write: distinct products,
// a different destination, both branches in the tenant, products that exist.
export async function prepareTransfer(params: {
  tenantId: string;
  fromStoreId: string;
  toStoreId: string;
  items: PendingOrderItem[];
}): Promise<{ ok: true; fromStore: Branch; toStore: Branch; productNames: Map<string, string> } | { ok: false; status: number; error: string }> {
  const { tenantId, fromStoreId, toStoreId, items } = params;
  if (items.length === 0) return { ok: false, status: 400, error: "Add at least one product to transfer." };
  if (new Set(items.map((i) => i.productId)).size !== items.length) {
    return { ok: false, status: 400, error: "Each product can only appear once per transfer." };
  }
  if (fromStoreId === toStoreId) return { ok: false, status: 400, error: "Choose a different branch to send to." };

  const [fromStore, toStore, products] = await Promise.all([
    prisma.store.findFirst({ where: { id: fromStoreId, tenantId }, select: { id: true, name: true } }),
    prisma.store.findFirst({ where: { id: toStoreId, tenantId, isActive: true }, select: { id: true, name: true } }),
    prisma.product.findMany({ where: { id: { in: items.map((i) => i.productId) }, tenantId }, select: { id: true, name: true } }),
  ]);
  if (!fromStore || !toStore) return { ok: false, status: 404, error: "Branch not found." };
  const productNames = new Map(products.map((p) => [p.id, p.name]));
  if (productNames.size !== items.length) return { ok: false, status: 400, error: "One of the products no longer exists." };
  return { ok: true, fromStore, toStore, productNames };
}

export const newTransferReference = () => `TR-${Date.now().toString(36).toUpperCase()}`;

// Moves stock (and its batches) between branches inside the caller's
// transaction. Throws TransferError if the source runs short, so the whole
// transaction — including whatever the caller did alongside — rolls back.
export async function executeTransfer(
  tx: Prisma.TransactionClient,
  params: {
    tenantId: string;
    userId: string;
    fromStore: Branch;
    toStore: Branch;
    items: PendingOrderItem[];
    productNames: Map<string, string>;
    reference: string;
    notes: string | null;
  }
) {
  const { tenantId, userId, fromStore, toStore, items, productNames, reference, notes } = params;
  const sourceBatchWhere = await batchesAtStore(tenantId, fromStore.id, tx);

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
          supplierId: batch.supplierId,
          quantity: move,
        },
      });
      remaining -= move;
    }
  }

  await tx.stockMovement.createMany({
    data: items.flatMap((item) => [
      {
        tenantId,
        storeId: fromStore.id,
        productId: item.productId,
        type: "TRANSFER" as const,
        quantity: -item.quantity,
        reason: `Transfer to ${toStore.name}`,
        reference,
        notes,
        userId,
      },
      {
        tenantId,
        storeId: toStore.id,
        productId: item.productId,
        type: "TRANSFER" as const,
        quantity: item.quantity,
        reason: `Transfer from ${fromStore.name}`,
        reference,
        notes,
        userId,
      },
    ]),
  });
}
