import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/session";

const SUPERVISOR_ROLES = ["OWNER", "ADMIN", "MANAGER"];

export async function GET(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.storeId) return NextResponse.json({ error: "No branch assigned to this account." }, { status: 400 });
  if (!SUPERVISOR_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const dateParam = searchParams.get("date");
  const day = dateParam ? new Date(dateParam) : new Date();
  const start = new Date(day.getFullYear(), day.getMonth(), day.getDate());
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  const [shifts, sales, cashTransactions] = await Promise.all([
    prisma.shift.findMany({
      where: { tenantId: session.tenantId, storeId: session.storeId, openedAt: { gte: start, lt: end } },
      include: { user: { select: { firstName: true, lastName: true } } },
      orderBy: { openedAt: "asc" },
    }),
    prisma.sale.findMany({
      where: { tenantId: session.tenantId, storeId: session.storeId, saleDate: { gte: start, lt: end } },
    }),
    prisma.cashTransaction.findMany({
      where: { tenantId: session.tenantId, storeId: session.storeId, createdAt: { gte: start, lt: end } },
    }),
  ]);

  const active = sales.filter((s) => s.status !== "CANCELLED");
  const completed = active.filter((s) => s.status === "COMPLETED");
  const returns = sales.filter((s) => s.status === "RETURNED" && s.originalSaleId);
  const voided = sales.filter((s) => s.status === "CANCELLED");

  const grossSales = active.reduce((sum, s) => sum + Number(s.subtotal), 0);
  const discountAmount = active.reduce((sum, s) => sum + Number(s.discountAmount), 0);
  const taxAmount = active.reduce((sum, s) => sum + Number(s.taxAmount), 0);
  const netSales = active.reduce((sum, s) => sum + Number(s.totalAmount), 0);

  const byMethod = new Map<string, { salesCount: number; totalAmount: number }>();
  for (const s of active) {
    const cur = byMethod.get(s.paymentMethod) ?? { salesCount: 0, totalAmount: 0 };
    cur.salesCount += 1;
    cur.totalAmount += Number(s.totalAmount);
    byMethod.set(s.paymentMethod, cur);
  }

  const shiftSummaries = shifts.map((s) => {
    const variance = s.endingCash != null && s.expectedCash != null ? Number(s.endingCash) - Number(s.expectedCash) : null;
    return {
      id: s.id,
      cashierName: `${s.user.firstName} ${s.user.lastName}`.trim(),
      openedAt: s.openedAt.toISOString(),
      closedAt: s.closedAt?.toISOString() ?? null,
      startingCash: Number(s.startingCash),
      endingCash: s.endingCash != null ? Number(s.endingCash) : null,
      expectedCash: s.expectedCash != null ? Number(s.expectedCash) : null,
      variance,
    };
  });

  const cashIns = cashTransactions.filter((t) => t.type === "CASH_IN");
  const cashOuts = cashTransactions.filter((t) => t.type === "CASH_OUT");

  return NextResponse.json({
    date: start.toISOString().slice(0, 10),
    salesCount: completed.length,
    grossSales,
    discountAmount,
    taxAmount,
    netSales,
    paymentMethods: Array.from(byMethod.entries()).map(([method, v]) => ({ method, ...v })),
    returnsCount: returns.length,
    returnsAmount: returns.reduce((sum, s) => sum + Number(s.totalAmount), 0),
    voidedCount: voided.length,
    totalCashVariance: shiftSummaries.reduce((sum, s) => sum + (s.variance ?? 0), 0),
    eWallet: {
      cashInCount: cashIns.length,
      cashInTotal: cashIns.reduce((sum, t) => sum + Number(t.amount), 0),
      cashOutCount: cashOuts.length,
      cashOutTotal: cashOuts.reduce((sum, t) => sum + Number(t.amount), 0),
      feesEarned: cashTransactions.reduce((sum, t) => sum + Number(t.serviceFee), 0),
    },
    shifts: shiftSummaries,
  });
}
