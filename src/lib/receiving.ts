import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { allocateCredit, applyUnappliedCredits, dueDateFor } from "@/lib/payables";

const PH_OFFSET_MS = 8 * 60 * 60 * 1000;

export interface ReceivingLineInput {
  productId: string;
  batchNumber: string;
  expirationDate: string; // YYYY-MM-DD
  quantity: number;
  unitCost: number;
}

export interface ReceivingInput {
  supplierId?: string | null;
  referenceNumber?: string | null;
  receivedDate?: string | null; // YYYY-MM-DD; today when empty
  notes?: string | null;
  items: ReceivingLineInput[];
  // Paid when it arrived (cash on delivery): records the payment right away.
  paidNow?: { method: string; referenceNumber?: string | null } | null;
}

export class ReceivingError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

// Checks a delivery before anything is written, so a bad line never leaves
// half a delivery received. Returns the cleaned-up lines.
export async function validateReceiving(tenantId: string, input: ReceivingInput) {
  if (!Array.isArray(input.items) || input.items.length === 0) throw new ReceivingError("Add at least one item to the delivery.");
  if (input.items.length > 200) throw new ReceivingError("A delivery can have at most 200 lines.");
  if (input.receivedDate && !isDate(input.receivedDate)) throw new ReceivingError("The delivery date is not valid.");

  const productIds = [...new Set(input.items.map((i) => i.productId))];
  const products = await prisma.product.findMany({
    where: { id: { in: productIds }, tenantId },
    select: { id: true, name: true },
  });
  const nameOf = new Map(products.map((p) => [p.id, p.name]));

  const seen = new Set<string>();
  const lines = input.items.map((raw, idx) => {
    const name = nameOf.get(raw.productId);
    const where = name ? name : `Line ${idx + 1}`;
    if (!name) throw new ReceivingError(`${where}: product not found.`);
    const batchNumber = typeof raw.batchNumber === "string" ? raw.batchNumber.trim() : "";
    if (!batchNumber) throw new ReceivingError(`${where}: enter the batch / lot number.`);
    if (!isDate(raw.expirationDate)) throw new ReceivingError(`${where}: enter the expiry date.`);
    const quantity = Number(raw.quantity);
    if (!Number.isInteger(quantity) || quantity <= 0) throw new ReceivingError(`${where}: quantity must be a whole number above 0.`);
    const unitCost = Number(raw.unitCost);
    if (!Number.isFinite(unitCost) || unitCost < 0) throw new ReceivingError(`${where}: enter the cost per unit.`);
    const key = `${raw.productId}:${batchNumber.toLowerCase()}`;
    if (seen.has(key)) throw new ReceivingError(`${where}: batch ${batchNumber} is listed twice.`);
    seen.add(key);
    return { productId: raw.productId, name, batchNumber, expirationDate: raw.expirationDate, quantity, unitCost: Math.round(unitCost * 100) / 100 };
  });
  return lines;
}

// RCV-yyyymmdd-0001, continuing from the day's last number (Philippine date).
async function nextReceivingNumber(tx: Prisma.TransactionClient, tenantId: string) {
  const key = new Date(Date.now() + PH_OFFSET_MS).toISOString().slice(0, 10).replace(/-/g, "");
  const prefix = `RCV-${key}-`;
  const last = await tx.receiving.findFirst({
    where: { tenantId, receivingNumber: { startsWith: prefix } },
    orderBy: { receivingNumber: "desc" },
    select: { receivingNumber: true },
  });
  const seq = last ? parseInt(last.receivingNumber.slice(prefix.length), 10) || 0 : 0;
  return `${prefix}${String(seq + 1).padStart(4, "0")}`;
}

// Receives a whole delivery at one branch in a single transaction: each line
// goes into its batch (a new one, or the same lot already on the shelf),
// stock goes up, a PURCHASE movement is logged, and the product's cost price
// follows the latest delivery.
export async function receiveDelivery(params: {
  tenantId: string;
  storeId: string;
  userId: string;
  input: ReceivingInput;
  lines: Awaited<ReturnType<typeof validateReceiving>>;
  supplier: { id: string; name: string; paymentTermsDays: number } | null;
}) {
  const { tenantId, storeId, userId, input, lines, supplier } = params;
  // A past delivery date is recorded at noon that day (Philippine time); today uses the actual time.
  const todayPH = new Date(Date.now() + PH_OFFSET_MS).toISOString().slice(0, 10);
  const receivedAt = input.receivedDate && input.receivedDate !== todayPH ? new Date(`${input.receivedDate}T12:00:00+08:00`) : new Date();
  const referenceNumber = input.referenceNumber?.trim().slice(0, 60) || null;
  const totalCost = lines.reduce((sum, l) => sum + l.quantity * l.unitCost, 0);

  for (let attempt = 1; ; attempt++) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          const receivingNumber = await nextReceivingNumber(tx, tenantId);
          const receiving = await tx.receiving.create({
            data: {
              tenantId,
              storeId,
              supplierId: supplier?.id ?? null,
              receivingNumber,
              referenceNumber,
              receivedAt,
              notes: input.notes?.trim().slice(0, 500) || null,
              totalCost: Math.round(totalCost * 100) / 100,
              receivedById: userId,
              dueDate: dueDateFor(receivedAt, supplier?.paymentTermsDays ?? 0),
            },
          });

          const stockChanges: { productId: string; name: string; previousStock: number; currentStock: number }[] = [];
          for (const line of lines) {
            // Stored the same way batches always have been (midnight UTC of the expiry date).
            const expirationDate = new Date(line.expirationDate);
            const existing = await tx.productBatch.findFirst({
              where: { productId: line.productId, storeId, batchNumber: { equals: line.batchNumber, mode: "insensitive" } },
            });
            let batchId: string;
            if (existing) {
              // Same lot delivered again: it must be the same expiry to share a batch.
              if (existing.expirationDate.toISOString().slice(0, 10) !== expirationDate.toISOString().slice(0, 10)) {
                throw new ReceivingError(
                  `${line.name}: batch ${line.batchNumber} is already on hand with a different expiry. Check the lot number.`
                );
              }
              const updated = await tx.productBatch.update({
                where: { id: existing.id },
                data: { quantity: { increment: line.quantity }, costPrice: line.unitCost, supplierId: existing.supplierId ?? supplier?.id ?? null },
              });
              batchId = updated.id;
            } else {
              const created = await tx.productBatch.create({
                data: {
                  productId: line.productId,
                  storeId,
                  supplierId: supplier?.id ?? null,
                  batchNumber: line.batchNumber,
                  expirationDate,
                  quantity: line.quantity,
                  costPrice: line.unitCost,
                  receivedDate: receivedAt,
                },
              });
              batchId = created.id;
            }

            await tx.receivingItem.create({
              data: {
                receivingId: receiving.id,
                productId: line.productId,
                batchId,
                batchNumber: line.batchNumber,
                expirationDate,
                quantity: line.quantity,
                unitCost: line.unitCost,
              },
            });

            const stock = await tx.productStock.findUnique({ where: { productId_storeId: { productId: line.productId, storeId } } });
            const updatedStock = await tx.productStock.upsert({
              where: { productId_storeId: { productId: line.productId, storeId } },
              update: { currentStock: { increment: line.quantity } },
              create: { productId: line.productId, storeId, currentStock: line.quantity },
            });
            stockChanges.push({ productId: line.productId, name: line.name, previousStock: stock?.currentStock ?? 0, currentStock: updatedStock.currentStock });

            await tx.stockMovement.create({
              data: {
                tenantId,
                storeId,
                productId: line.productId,
                type: "PURCHASE",
                quantity: line.quantity,
                reason: `Received ${receivingNumber}${supplier ? ` from ${supplier.name}` : ""} · batch ${line.batchNumber}`,
                reference: receivingNumber,
                userId,
              },
            });

            await tx.product.update({ where: { id: line.productId }, data: { costPrice: line.unitCost } });
          }

          if (supplier) {
            if (input.paidNow) {
              const payment = await tx.supplierPayment.create({
                data: {
                  tenantId,
                  supplierId: supplier.id,
                  amount: receiving.totalCost,
                  paidAt: receivedAt,
                  method: input.paidNow.method,
                  referenceNumber: input.paidNow.referenceNumber?.trim().slice(0, 60) || null,
                  notes: `Paid on delivery (${receivingNumber})`,
                  recordedById: userId,
                },
              });
              await allocateCredit(tx, { tenantId, supplierId: supplier.id, amount: Number(receiving.totalCost), paymentId: payment.id, preferReceivingIds: [receiving.id] });
            }
            // Credit already on file with this supplier (an advance or a return) settles it.
            await applyUnappliedCredits(tx, tenantId, supplier.id);
          }

          return { receiving, stockChanges };
        },
        { timeout: 60000, maxWait: 10000 }
      );
    } catch (error) {
      const target = (error as { meta?: { target?: unknown } }).meta?.target;
      if ((error as { code?: string }).code === "P2002" && /receivingNumber/.test(String(target)) && attempt < 5) continue;
      throw error;
    }
  }
}
