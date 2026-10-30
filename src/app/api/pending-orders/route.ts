import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/session";
import { parsePendingItems } from "@/lib/pending-orders";

// Open orders waiting for a cashier at the current branch, with each line
// resolved against today's product price and this branch's stock so the
// cashier's cart is built from current data, not a stale snapshot.
export async function GET(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.storeId) return NextResponse.json([]);

  const orders = await prisma.pendingOrder.findMany({
    where: { tenantId: session.tenantId, storeId: session.storeId, status: "OPEN" },
    include: { createdBy: { select: { id: true, firstName: true, lastName: true } } },
    orderBy: { createdAt: "asc" },
  });
  if (orders.length === 0) return NextResponse.json([]);

  const productIds = [...new Set(orders.flatMap((o) => parsePendingItems(o.items).map((i) => i.productId)))];
  const products = await prisma.product.findMany({
    where: { id: { in: productIds }, tenantId: session.tenantId },
    select: {
      id: true,
      name: true,
      strength: true,
      dosageForm: true,
      sellingPrice: true,
      isVatable: true,
      requiresPrescription: true,
      stocks: { where: { storeId: session.storeId }, select: { currentStock: true } },
    },
  });
  const productMap = new Map(products.map((p) => [p.id, p]));

  return NextResponse.json(
    orders.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      orderRemarks: o.orderRemarks,
      createdAt: o.createdAt.toISOString(),
      createdBy: { id: o.createdBy.id, name: `${o.createdBy.firstName} ${o.createdBy.lastName}`.trim() },
      items: parsePendingItems(o.items).flatMap((i) => {
        const p = productMap.get(i.productId);
        if (!p) return [];
        return [
          {
            productId: p.id,
            name: p.name,
            strength: p.strength,
            dosageForm: p.dosageForm,
            price: Number(p.sellingPrice),
            quantity: i.quantity,
            currentStock: p.stocks[0]?.currentStock ?? 0,
            isVatable: p.isVatable,
            requiresPrescription: p.requiresPrescription,
          },
        ];
      }),
    }))
  );
}

export async function POST(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.storeId) return NextResponse.json({ error: "No branch assigned to this account." }, { status: 400 });

  const body = await request.json();
  const items = parsePendingItems(body.items);
  const orderRemarks = typeof body.orderRemarks === "string" ? body.orderRemarks.trim() : "";
  if (items.length === 0) return NextResponse.json({ error: "The order is empty." }, { status: 400 });

  const products = await prisma.product.findMany({
    where: { id: { in: items.map((i) => i.productId) }, tenantId: session.tenantId, isActive: true },
    select: { id: true, name: true, stocks: { where: { storeId: session.storeId }, select: { currentStock: true } } },
  });
  const productMap = new Map(products.map((p) => [p.id, p]));
  for (const item of items) {
    const product = productMap.get(item.productId);
    if (!product) return NextResponse.json({ error: "One of the products no longer exists." }, { status: 400 });
    const available = product.stocks[0]?.currentStock ?? 0;
    if (item.quantity > available) {
      return NextResponse.json({ error: `Not enough stock for ${product.name}. Available: ${available}.` }, { status: 409 });
    }
  }

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dateKey = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;

  // Numbering is per tenant per day, like sales; retry if two order takers
  // submit at the same moment and race for the same number.
  for (let attempt = 0; attempt < 3; attempt++) {
    const todayCount = await prisma.pendingOrder.count({ where: { tenantId: session.tenantId, createdAt: { gte: todayStart } } });
    const orderNumber = `ORD-${dateKey}-${String(todayCount + 1 + attempt).padStart(4, "0")}`;
    try {
      const order = await prisma.pendingOrder.create({
        data: {
          tenantId: session.tenantId,
          storeId: session.storeId,
          orderNumber,
          items: items as unknown as Prisma.InputJsonValue,
          orderRemarks: orderRemarks || null,
          createdById: session.userId,
        },
      });
      return NextResponse.json({ id: order.id, orderNumber: order.orderNumber }, { status: 201 });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") continue;
      throw error;
    }
  }
  return NextResponse.json({ error: "Couldn't save the order. Please try again." }, { status: 503 });
}
