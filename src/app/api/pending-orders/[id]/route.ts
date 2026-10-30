import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/session";
import { canCollectPayment } from "@/lib/permissions-shared";

// Cancels an open order. The order taker who created it can cancel their own;
// anyone who can collect payment (cashiers and up) can cancel any at the branch.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { action } = (await request.json()) as { action?: string };
  if (action !== "cancel") return NextResponse.json({ error: "Invalid action." }, { status: 400 });

  const order = await prisma.pendingOrder.findFirst({ where: { id, tenantId: session.tenantId, storeId: session.storeId ?? undefined } });
  if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 });
  if (order.createdById !== session.userId && !canCollectPayment(session.role)) {
    return NextResponse.json({ error: "You can only cancel orders you created." }, { status: 403 });
  }

  const updated = await prisma.pendingOrder.updateMany({ where: { id, status: "OPEN" }, data: { status: "CANCELLED" } });
  if (updated.count !== 1) return NextResponse.json({ error: "This order is no longer open." }, { status: 409 });
  return NextResponse.json({ ok: true });
}
