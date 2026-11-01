import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/session";
import { hasPermission } from "@/lib/permissions";
import { PAYMENT_METHODS, allocateCredit } from "@/lib/payables";

const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

// Records a payment to a supplier: { amount, method, paidOn?, referenceNumber?,
// notes?, receivingIds? }. It settles the chosen deliveries first, then the
// oldest due; anything over stays as credit.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasPermission(session.tenantId, session.role, "suppliers_pay"))) {
    return NextResponse.json({ error: "You don't have permission to record supplier payments." }, { status: 403 });
  }
  const { id } = await params;
  const supplier = await prisma.supplier.findFirst({ where: { id, tenantId: session.tenantId }, select: { id: true } });
  if (!supplier) return NextResponse.json({ error: "Supplier not found." }, { status: 404 });

  const body = await request.json();
  const amount = Math.round(Number(body.amount) * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0) return NextResponse.json({ error: "Enter the amount paid." }, { status: 400 });
  if (amount > 99_999_999) return NextResponse.json({ error: "That amount is too large." }, { status: 400 });
  if (!PAYMENT_METHODS.includes(body.method)) return NextResponse.json({ error: "Choose how it was paid." }, { status: 400 });
  if (body.paidOn && !isDate(body.paidOn)) return NextResponse.json({ error: "The payment date is not valid." }, { status: 400 });
  const receivingIds = Array.isArray(body.receivingIds) ? body.receivingIds.filter((v: unknown): v is string => typeof v === "string") : [];

  const todayPH = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
  const paidAt = body.paidOn && body.paidOn !== todayPH ? new Date(`${body.paidOn}T12:00:00+08:00`) : new Date();

  const result = await prisma.$transaction(async (tx) => {
    const payment = await tx.supplierPayment.create({
      data: {
        tenantId: session.tenantId,
        supplierId: id,
        amount,
        paidAt,
        method: body.method,
        referenceNumber: typeof body.referenceNumber === "string" ? body.referenceNumber.trim().slice(0, 60) || null : null,
        notes: typeof body.notes === "string" ? body.notes.trim().slice(0, 500) || null : null,
        recordedById: session.userId,
      },
    });
    const left = await allocateCredit(tx, { tenantId: session.tenantId, supplierId: id, amount, paymentId: payment.id, preferReceivingIds: receivingIds });
    return { id: payment.id, applied: Math.round((amount - left) * 100) / 100, credit: left };
  });
  return NextResponse.json(result, { status: 201 });
}
