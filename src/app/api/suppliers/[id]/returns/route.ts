import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/session";
import { getRolePermissions } from "@/lib/permissions";
import { batchesAtStore } from "@/lib/branch-scope";
import { invalidateCached } from "@/lib/route-cache";
import { RETURN_REASONS, RETURN_SETTLEMENTS, allocateCredit, nextDailyNumber } from "@/lib/payables";

class ReturnError extends Error {}

// Sends stock back to the supplier from this branch:
// { reason, settlement, referenceNumber?, notes?, items: [{ batchId, quantity }] }.
// Stock goes down with a RETURN movement; a CREDIT settlement lowers what's owed.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.storeId) return NextResponse.json({ error: "No branch assigned to this account." }, { status: 400 });
  const p = await getRolePermissions(session.tenantId, session.role);
  if (!p.suppliers || !p.inventory_adjust) return NextResponse.json({ error: "You don't have permission to return stock." }, { status: 403 });
  const storeId = session.storeId;

  const { id } = await params;
  const supplier = await prisma.supplier.findFirst({ where: { id, tenantId: session.tenantId }, select: { id: true, name: true } });
  if (!supplier) return NextResponse.json({ error: "Supplier not found." }, { status: 404 });

  const body = await request.json();
  if (!(body.reason in RETURN_REASONS)) return NextResponse.json({ error: "Choose why the stock is being returned." }, { status: 400 });
  if (!(body.settlement in RETURN_SETTLEMENTS)) return NextResponse.json({ error: "Choose how the supplier will settle it." }, { status: 400 });
  const lines: { batchId: string; quantity: number }[] = Array.isArray(body.items)
    ? body.items.map((i: { batchId?: unknown; quantity?: unknown }) => ({ batchId: String(i.batchId ?? ""), quantity: Number(i.quantity) }))
    : [];
  if (lines.length === 0) return NextResponse.json({ error: "Add at least one item to return." }, { status: 400 });
  if (new Set(lines.map((l) => l.batchId)).size !== lines.length) return NextResponse.json({ error: "A lot is listed twice." }, { status: 400 });
  if (lines.some((l) => !Number.isInteger(l.quantity) || l.quantity <= 0)) return NextResponse.json({ error: "Quantities must be whole numbers above 0." }, { status: 400 });

  const atStore = await batchesAtStore(session.tenantId, storeId);
  try {
    const result = await prisma.$transaction(
      async (tx) => {
        const batches = await tx.productBatch.findMany({
          where: { id: { in: lines.map((l) => l.batchId) }, product: { tenantId: session.tenantId }, AND: [atStore] },
          include: { product: { select: { id: true, name: true } } },
        });
        const byId = new Map(batches.map((b) => [b.id, b]));
        let totalCost = 0;
        for (const l of lines) {
          const b = byId.get(l.batchId);
          if (!b) throw new ReturnError("A lot isn't at this branch any more. Refresh and try again.");
          if (b.supplierId && b.supplierId !== supplier.id) throw new ReturnError(`${b.product.name} batch ${b.batchNumber} came from another supplier.`);
          if (l.quantity > b.quantity) throw new ReturnError(`Only ${b.quantity} of ${b.product.name} batch ${b.batchNumber} are on hand.`);
          totalCost += l.quantity * Number(b.costPrice);
        }

        const returnNumber = await nextDailyNumber(tx, session.tenantId, "RTS");
        const created = await tx.supplierReturn.create({
          data: {
            tenantId: session.tenantId,
            storeId,
            supplierId: supplier.id,
            returnNumber,
            reason: body.reason,
            settlement: body.settlement,
            referenceNumber: typeof body.referenceNumber === "string" ? body.referenceNumber.trim().slice(0, 60) || null : null,
            notes: typeof body.notes === "string" ? body.notes.trim().slice(0, 500) || null : null,
            totalCost: Math.round(totalCost * 100) / 100,
            createdById: session.userId,
          },
        });

        for (const l of lines) {
          const b = byId.get(l.batchId)!;
          await tx.supplierReturnItem.create({
            data: { returnId: created.id, productId: b.productId, batchId: b.id, batchNumber: b.batchNumber, expirationDate: b.expirationDate, quantity: l.quantity, unitCost: b.costPrice },
          });
          await tx.productBatch.update({ where: { id: b.id }, data: { quantity: { decrement: l.quantity } } });
          const stock = await tx.productStock.findUnique({ where: { productId_storeId: { productId: b.productId, storeId } } });
          await tx.productStock.upsert({
            where: { productId_storeId: { productId: b.productId, storeId } },
            update: { currentStock: Math.max(0, (stock?.currentStock ?? 0) - l.quantity) },
            create: { productId: b.productId, storeId, currentStock: 0 },
          });
          await tx.stockMovement.create({
            data: {
              tenantId: session.tenantId,
              storeId,
              productId: b.productId,
              type: "RETURN",
              quantity: -l.quantity,
              reason: `Returned to ${supplier.name} (${returnNumber}) · batch ${b.batchNumber}`,
              reference: returnNumber,
              userId: session.userId,
            },
          });
        }

        if (body.settlement === "CREDIT") {
          await allocateCredit(tx, { tenantId: session.tenantId, supplierId: supplier.id, amount: Number(created.totalCost), returnId: created.id });
        }
        return created;
      },
      { timeout: 60000, maxWait: 10000 }
    );
    invalidateCached(`products:${session.tenantId}`);
    return NextResponse.json({ id: result.id, returnNumber: result.returnNumber, totalCost: Number(result.totalCost) }, { status: 201 });
  } catch (error) {
    if (error instanceof ReturnError) return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }
}
