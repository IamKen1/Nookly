import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/session";
import { hasPermission } from "@/lib/permissions";
import { parsePendingItems } from "@/lib/pending-orders";
import { resolveCartLines } from "@/lib/cart-lines";

async function authorize(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (!session.storeId) return { response: NextResponse.json({ error: "No branch assigned to this account." }, { status: 400 }) };
  if (!(await hasPermission(session.tenantId, session.role, "pos"))) {
    return { response: NextResponse.json({ error: "You don't have access to the POS." }, { status: 403 }) };
  }
  return { session: { ...session, storeId: session.storeId } };
}

// Carts on hold at this branch, oldest first, each resolved to today's
// prices and stock so loading one back builds a current cart.
export async function GET(request: NextRequest) {
  const { session, response } = await authorize(request);
  if (!session) return response;

  const held = await prisma.heldCart.findMany({
    where: { tenantId: session.tenantId, storeId: session.storeId },
    include: { user: { select: { firstName: true, lastName: true } } },
    orderBy: { createdAt: "asc" },
    take: 50,
  });
  const all = held.flatMap((h) => parsePendingItems(h.items));
  const lines = await resolveCartLines(session.tenantId, session.storeId, all);
  const lineOf = new Map(lines.map((l) => [l.productId, l]));

  return NextResponse.json(
    held.map((h) => ({
      id: h.id,
      label: h.label,
      createdAt: h.createdAt.toISOString(),
      heldBy: `${h.user.firstName} ${h.user.lastName}`.trim(),
      items: parsePendingItems(h.items).flatMap((i) => {
        const line = lineOf.get(i.productId);
        return line ? [{ ...line, quantity: i.quantity }] : [];
      }),
    }))
  );
}

// Puts the current cart on hold: { label?, items: [{ productId, quantity }] }.
export async function POST(request: NextRequest) {
  const { session, response } = await authorize(request);
  if (!session) return response;

  const body = await request.json();
  const items = parsePendingItems(body.items);
  if (items.length === 0) return NextResponse.json({ error: "The cart is empty." }, { status: 400 });
  if (items.length > 200) return NextResponse.json({ error: "That cart is too large to hold." }, { status: 400 });
  const label = typeof body.label === "string" ? body.label.trim().slice(0, 60) || null : null;

  const count = await prisma.heldCart.count({ where: { tenantId: session.tenantId, storeId: session.storeId } });
  if (count >= 50) return NextResponse.json({ error: "There are already 50 carts on hold. Finish or remove some first." }, { status: 400 });

  const held = await prisma.heldCart.create({
    data: { tenantId: session.tenantId, storeId: session.storeId, userId: session.userId, label, items: items as unknown as Prisma.InputJsonValue },
  });
  return NextResponse.json({ id: held.id }, { status: 201 });
}
