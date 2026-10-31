import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/session";
import { hasPermission } from "@/lib/permissions";
import { requireFeature } from "@/lib/plan-gating";
import { invalidateCached } from "@/lib/route-cache";
import { parsePendingItems } from "@/lib/pending-orders";
import { executeTransfer, newTransferReference, prepareTransfer, TransferError } from "@/lib/stock-transfer";

// Recent transfers into or out of the current branch. Each transfer is a pair
// of TRANSFER stock movements (out of one branch, into another) that share a
// TR- reference, so they're grouped back together here.
export async function GET(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasPermission(session.tenantId, session.role, "inventory"))) {
    return NextResponse.json({ error: "You don't have access to Inventory." }, { status: 403 });
  }

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
  const notes = typeof body.notes === "string" ? body.notes.trim() : "";
  const items = parsePendingItems(body.items);
  const prep = await prepareTransfer({
    tenantId: session.tenantId,
    fromStoreId: session.storeId,
    toStoreId: typeof body.toStoreId === "string" ? body.toStoreId : "",
    items,
  });
  if (!prep.ok) return NextResponse.json({ error: prep.error }, { status: prep.status });
  const { fromStore, toStore, productNames } = prep;
  const reference = newTransferReference();

  try {
    await prisma.$transaction(
      (tx) => executeTransfer(tx, { tenantId: session.tenantId, userId: session.userId, fromStore, toStore, items, productNames, reference, notes: notes || null }),
      { timeout: 30000, maxWait: 10000 }
    );
  } catch (error) {
    if (error instanceof TransferError) return NextResponse.json({ error: error.message }, { status: 409 });
    throw error;
  }

  invalidateCached(`products:${session.tenantId}`);
  return NextResponse.json({ reference, from: fromStore.name, to: toStore.name, itemCount: items.length }, { status: 201 });
}
