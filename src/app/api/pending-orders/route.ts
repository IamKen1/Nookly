import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/session";
import { parsePendingItems } from "@/lib/pending-orders";
import { hasPermission } from "@/lib/permissions";
import { getTenantPlanCode, hasFeature } from "@/lib/plan-gating";
import { isDiscountAvailable } from "@/lib/discounts";
import { identifyStaff, staffCodeRequired } from "@/lib/staff-code";
import { prepareOrderPrescription, readOrderPrescription, type OrderPrescription } from "@/lib/order-prescription";

// Open orders waiting for a cashier at the current branch, with each line
// resolved against today's product price and this branch's stock so the
// cashier's cart is built from current data, not a stale snapshot.
export async function GET(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.storeId) return NextResponse.json([]);

  const orders = await prisma.pendingOrder.findMany({
    where: { tenantId: session.tenantId, storeId: session.storeId, status: "OPEN" },
    include: {
      createdBy: { select: { id: true, firstName: true, lastName: true } },
      takenBy: { select: { id: true, firstName: true, lastName: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  if (orders.length === 0) return NextResponse.json([]);

  const discountOf = (value: unknown) => {
    if (!value || typeof value !== "object") return null;
    const v = value as Record<string, unknown>;
    return typeof v.discountId === "string"
      ? { discountId: v.discountId, name: String(v.name ?? ""), idNumber: String(v.idNumber ?? ""), holderName: String(v.holderName ?? "") }
      : null;
  };

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
      stocks: { where: { storeId: session.storeId }, select: { currentStock: true, sellingPrice: true } },
    },
  });
  const productMap = new Map(products.map((p) => [p.id, p]));

  return NextResponse.json(
    orders.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      orderRemarks: o.orderRemarks,
      createdAt: o.createdAt.toISOString(),
      // The person who took it: whoever entered their security code, else the account.
      createdBy: {
        id: (o.takenBy ?? o.createdBy).id,
        name: `${(o.takenBy ?? o.createdBy).firstName} ${(o.takenBy ?? o.createdBy).lastName}`.trim(),
      },
      // The account it was sent from, when that's someone else's login.
      sentFrom: o.takenBy && o.takenBy.id !== o.createdBy.id ? `${o.createdBy.firstName} ${o.createdBy.lastName}`.trim() : null,
      // Only the label: the cashier sees it, the sale reads the rest from the order.
      prescription: readOrderPrescription(o.prescription)?.label ?? null,
      discount: discountOf(o.discount),
      items: parsePendingItems(o.items).flatMap((i) => {
        const p = productMap.get(i.productId);
        if (!p) return [];
        return [
          {
            productId: p.id,
            name: p.name,
            strength: p.strength,
            dosageForm: p.dosageForm,
            price: Number(p.stocks[0]?.sellingPrice ?? p.sellingPrice),
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
  if (!(await hasPermission(session.tenantId, session.role, "pos_send_to_cashier"))) {
    return NextResponse.json({ error: "You can't send orders to the cashier." }, { status: 403 });
  }
  if (!session.storeId) return NextResponse.json({ error: "No branch assigned to this account." }, { status: 400 });

  const body = await request.json();
  const items = parsePendingItems(body.items);
  const orderRemarks = typeof body.orderRemarks === "string" ? body.orderRemarks.trim() : "";
  if (items.length === 0) return NextResponse.json({ error: "The order is empty." }, { status: 400 });

  const products = await prisma.product.findMany({
    where: { id: { in: items.map((i) => i.productId) }, tenantId: session.tenantId, isActive: true },
    select: { id: true, name: true, requiresPrescription: true, stocks: { where: { storeId: session.storeId }, select: { currentStock: true, isHidden: true } } },
  });
  const productMap = new Map(products.map((p) => [p.id, p]));
  for (const item of items) {
    const product = productMap.get(item.productId);
    if (!product) return NextResponse.json({ error: "One of the products no longer exists." }, { status: 400 });
    if (product.stocks[0]?.isHidden) return NextResponse.json({ error: `${product.name} isn't sold at this branch.` }, { status: 400 });
    const available = product.stocks[0]?.currentStock ?? 0;
    if (item.quantity > available) {
      return NextResponse.json({ error: `Not enough stock for ${product.name}. Available: ${available}.`, code: "STOCK" }, { status: 409 });
    }
  }

  // A prescription entered by the order taker rides along until payment.
  let prescription: OrderPrescription | null = null;
  if (body.prescription) {
    if (!(await hasFeature(await getTenantPlanCode(session.tenantId), "prescriptions"))) {
      return NextResponse.json({ error: "Your plan doesn't include prescriptions." }, { status: 403 });
    }
    const prepared = await prepareOrderPrescription(session.tenantId, body.prescription, items, new Map(products.map((p) => [p.id, p.requiresPrescription])));
    if ("error" in prepared) return NextResponse.json({ error: prepared.error }, { status: 400 });
    prescription = prepared.value;
  }

  // The discount picked when taking the order; the cashier's checkout starts with it.
  let discount: { discountId: string; name: string; idNumber?: string; holderName?: string } | null = null;
  if (typeof body.discountId === "string" && body.discountId) {
    const found = await prisma.discount.findFirst({ where: { id: body.discountId, tenantId: session.tenantId } });
    if (!found || !isDiscountAvailable(found, session.storeId)) {
      return NextResponse.json({ error: "That discount isn't available right now. Choose another one." }, { status: 400 });
    }
    const text = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, 100) : "");
    discount = { discountId: found.id, name: found.name, idNumber: text(body.discountIdNumber) || undefined, holderName: text(body.discountHolderName) || undefined };
  }

  // With security codes on, the order is on record as whoever entered theirs.
  let takenById: string | null = null;
  if (await staffCodeRequired(session.tenantId)) {
    const who = await identifyStaff(session.tenantId, session.userId, body.staffCode, "send");
    if ("error" in who) return NextResponse.json({ error: who.error, code: "STAFF_CODE" }, { status: who.status });
    takenById = who.user.id;
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
          prescription: prescription ? (prescription as unknown as Prisma.InputJsonValue) : undefined,
          discount: discount ? (discount as unknown as Prisma.InputJsonValue) : undefined,
          createdById: session.userId,
          takenById,
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
