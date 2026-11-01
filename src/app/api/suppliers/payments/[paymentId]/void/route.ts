import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/session";
import { hasPermission } from "@/lib/permissions";
import { voidPayment } from "@/lib/payables";

// Voids a payment recorded by mistake. It stays on the list, marked voided,
// and the deliveries it settled are open again.
export async function POST(request: NextRequest, { params }: { params: Promise<{ paymentId: string }> }) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasPermission(session.tenantId, session.role, "suppliers_pay"))) {
    return NextResponse.json({ error: "You don't have permission to change supplier payments." }, { status: 403 });
  }
  const { paymentId } = await params;
  const voided = await prisma.$transaction((tx) => voidPayment(tx, session.tenantId, paymentId));
  if (!voided) return NextResponse.json({ error: "Payment not found or already voided." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
