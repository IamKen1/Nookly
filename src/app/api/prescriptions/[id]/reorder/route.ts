import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/session";
import { hasPermission } from "@/lib/permissions";
import { resolveCartLines } from "@/lib/cart-lines";

// The cart lines for re-ordering a prescription at the POS: what's still left to serve.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.storeId) return NextResponse.json({ error: "No branch assigned to this account." }, { status: 400 });
  const [canPos, canRx] = await Promise.all([
    hasPermission(session.tenantId, session.role, "pos"),
    hasPermission(session.tenantId, session.role, "prescriptions"),
  ]);
  if (!canPos && !canRx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const rx = await prisma.prescription.findFirst({
    where: { id, tenantId: session.tenantId },
    include: { items: true, customer: { select: { firstName: true, lastName: true } } },
  });
  if (!rx) return NextResponse.json({ error: "Prescription not found." }, { status: 404 });

  const remaining = rx.items.map((i) => ({ productId: i.productId, quantity: Math.max(0, i.quantity - i.servedQuantity) })).filter((i) => i.quantity > 0);
  // Only a prescription still being served can be reordered; a fully served one is done.
  if (!(rx.status === "PENDING" || rx.status === "PARTIAL") || remaining.length === 0) {
    return NextResponse.json({ error: `${rx.prescriptionNumber} is fully served — there's nothing left to reorder.` }, { status: 400 });
  }
  const continues = true;
  const wanted = remaining;

  return NextResponse.json({
    prescription: {
      id: rx.id,
      prescriptionNumber: rx.prescriptionNumber,
      status: rx.status,
      customerName: `${rx.customer.firstName} ${rx.customer.lastName}`.trim(),
      continues,
    },
    lines: await resolveCartLines(session.tenantId, session.storeId, wanted),
  });
}
