import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/session";
import { hasPermission } from "@/lib/permissions";
import { requireFeature } from "@/lib/plan-gating";
import { parsePendingItems } from "@/lib/pending-orders";
import { prepareTransfer } from "@/lib/stock-transfer";

// Requests involving the current branch: "incoming" ones it has been asked to
// send, and "outgoing" ones it asked another branch for.
export async function GET(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.storeId) return NextResponse.json({ incoming: [], outgoing: [] });

  const requests = await prisma.stockRequest.findMany({
    where: { tenantId: session.tenantId, OR: [{ fromStoreId: session.storeId }, { toStoreId: session.storeId }] },
    include: {
      fromStore: { select: { id: true, name: true } },
      toStore: { select: { id: true, name: true } },
      requestedBy: { select: { firstName: true, lastName: true } },
      handledBy: { select: { firstName: true, lastName: true } },
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 60,
  });

  const productIds = [...new Set(requests.flatMap((r) => parsePendingItems(r.items).map((i) => i.productId)))];
  const products = await prisma.product.findMany({
    where: { id: { in: productIds }, tenantId: session.tenantId },
    select: { id: true, name: true, stocks: { where: { storeId: session.storeId }, select: { currentStock: true } } },
  });
  const productMap = new Map(products.map((p) => [p.id, p]));
  const name = (u: { firstName: string; lastName: string } | null) => (u ? `${u.firstName} ${u.lastName}`.trim() : null);

  const rows = requests.map((r) => ({
    id: r.id,
    requestNumber: r.requestNumber,
    status: r.status,
    notes: r.notes,
    decisionNote: r.decisionNote,
    transferReference: r.transferReference,
    createdAt: r.createdAt.toISOString(),
    handledAt: r.handledAt?.toISOString() ?? null,
    fromStore: r.fromStore,
    toStore: r.toStore,
    requestedBy: name(r.requestedBy),
    handledBy: name(r.handledBy),
    items: parsePendingItems(r.items).map((i) => ({
      productId: i.productId,
      name: productMap.get(i.productId)?.name ?? "Deleted product",
      quantity: i.quantity,
      // Stock at the current branch — what the supplying branch can send.
      availableHere: productMap.get(i.productId)?.stocks[0]?.currentStock ?? 0,
    })),
  }));

  return NextResponse.json({
    incoming: rows.filter((r) => r.fromStore.id === session.storeId),
    outgoing: rows.filter((r) => r.toStore.id === session.storeId),
  });
}

export async function POST(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.storeId) return NextResponse.json({ error: "No branch assigned to this account." }, { status: 400 });
  if (!(await hasPermission(session.tenantId, session.role, "inventory_adjust"))) {
    return NextResponse.json({ error: "You don't have permission to request stock." }, { status: 403 });
  }
  const gate = await requireFeature(session.tenantId, "multiBranch");
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const body = await request.json();
  const items = parsePendingItems(body.items);
  const notes = typeof body.notes === "string" ? body.notes.trim() : "";
  const fromStoreId = typeof body.fromStoreId === "string" ? body.fromStoreId : "";

  // Same validation as a transfer, from the supplying branch to this one.
  const prep = await prepareTransfer({ tenantId: session.tenantId, fromStoreId, toStoreId: session.storeId, items });
  if (!prep.ok) return NextResponse.json({ error: prep.error.replace("send to", "request from") }, { status: prep.status });

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dateKey = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    const todayCount = await prisma.stockRequest.count({ where: { tenantId: session.tenantId, createdAt: { gte: todayStart } } });
    const requestNumber = `SR-${dateKey}-${String(todayCount + 1 + attempt).padStart(4, "0")}`;
    try {
      const created = await prisma.stockRequest.create({
        data: {
          tenantId: session.tenantId,
          requestNumber,
          fromStoreId: prep.fromStore.id,
          toStoreId: prep.toStore.id,
          items: items as unknown as Prisma.InputJsonValue,
          notes: notes || null,
          requestedById: session.userId,
        },
      });
      return NextResponse.json({ id: created.id, requestNumber, from: prep.fromStore.name }, { status: 201 });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") continue;
      throw error;
    }
  }
  return NextResponse.json({ error: "Couldn't save the request. Please try again." }, { status: 503 });
}
