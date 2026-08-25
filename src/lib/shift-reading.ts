import { prisma } from "@/lib/prisma";

export interface ShiftReading {
  id: string;
  openedAt: string;
  closedAt: string | null;
  startingCash: number;
  endingCash: number | null;
  expectedCash: number | null;
  notes: string | null;
  cashierName: string;
  storeId: string;
  salesCount: number;
  grossSales: number;
  discountAmount: number;
  taxAmount: number;
  netSales: number;
  paymentMethods: { method: string; salesCount: number; totalAmount: number }[];
  returnsCount: number;
  returnsAmount: number;
  voidedCount: number;
  cashSalesTotal: number;
  eWallet: {
    cashInCount: number;
    cashInTotal: number;
    cashOutCount: number;
    cashOutTotal: number;
    feesEarned: number;
    netCashImpact: number;
  };
  load: {
    count: number;
    total: number;
    feesEarned: number;
  };
  expenses: {
    count: number;
    total: number;
    items: { id: string; description: string; amount: number; createdAt: string }[];
  };
  computedExpectedCash: number;
}

export async function computeShiftReading(shiftId: string): Promise<ShiftReading | null> {
  const shift = await prisma.shift.findUnique({
    where: { id: shiftId },
    include: { user: { select: { firstName: true, lastName: true } } },
  });
  if (!shift) return null;

  const [sales, cashTransactions, shiftExpenses] = await Promise.all([
    prisma.sale.findMany({ where: { shiftId } }),
    prisma.cashTransaction.findMany({ where: { shiftId } }),
    prisma.shiftExpense.findMany({ where: { shiftId }, orderBy: { createdAt: "asc" } }),
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

  const cashSalesTotal = active.filter((s) => s.paymentMethod === "CASH").reduce((sum, s) => sum + Number(s.totalAmount), 0);

  const cashIns = cashTransactions.filter((t) => t.type === "CASH_IN");
  const cashOuts = cashTransactions.filter((t) => t.type === "CASH_OUT");
  const loads = cashTransactions.filter((t) => t.type === "LOAD");
  const cashInTotal = cashIns.reduce((sum, t) => sum + Number(t.amount), 0);
  const cashOutTotal = cashOuts.reduce((sum, t) => sum + Number(t.amount), 0);
  const loadTotal = loads.reduce((sum, t) => sum + Number(t.amount), 0);
  const eWalletFeesEarned = [...cashIns, ...cashOuts].reduce((sum, t) => sum + Number(t.serviceFee), 0);
  const loadFeesEarned = loads.reduce((sum, t) => sum + Number(t.serviceFee), 0);
  // Cash-in: customer's physical cash comes into the drawer, plus the fee earned.
  // Cash-out: physical cash leaves the drawer for the amount, net of the fee kept.
  // Load: customer pays cash for prepaid load — same direction as cash-in, no
  // physical cash leaves the drawer (its fee is included below too).
  const netCashImpact = cashInTotal - cashOutTotal + loadTotal + eWalletFeesEarned + loadFeesEarned;
  const expensesTotal = shiftExpenses.reduce((sum, e) => sum + Number(e.amount), 0);

  return {
    id: shift.id,
    openedAt: shift.openedAt.toISOString(),
    closedAt: shift.closedAt?.toISOString() ?? null,
    startingCash: Number(shift.startingCash),
    endingCash: shift.endingCash != null ? Number(shift.endingCash) : null,
    expectedCash: shift.expectedCash != null ? Number(shift.expectedCash) : null,
    notes: shift.notes,
    cashierName: `${shift.user.firstName} ${shift.user.lastName}`.trim(),
    storeId: shift.storeId,
    salesCount: completed.length,
    grossSales,
    discountAmount,
    taxAmount,
    netSales,
    paymentMethods: Array.from(byMethod.entries()).map(([method, v]) => ({ method, ...v })),
    returnsCount: returns.length,
    returnsAmount: returns.reduce((sum, s) => sum + Number(s.totalAmount), 0),
    voidedCount: voided.length,
    cashSalesTotal,
    eWallet: {
      cashInCount: cashIns.length,
      cashInTotal,
      cashOutCount: cashOuts.length,
      cashOutTotal,
      feesEarned: eWalletFeesEarned,
      netCashImpact,
    },
    load: {
      count: loads.length,
      total: loadTotal,
      feesEarned: loadFeesEarned,
    },
    expenses: {
      count: shiftExpenses.length,
      total: expensesTotal,
      items: shiftExpenses.map((e) => ({
        id: e.id,
        description: e.description,
        amount: Number(e.amount),
        createdAt: e.createdAt.toISOString(),
      })),
    },
    computedExpectedCash: Number(shift.startingCash) + cashSalesTotal + netCashImpact - expensesTotal,
  };
}
