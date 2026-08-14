import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/session";
import { requireFeature } from "@/lib/plan-gating";
import { getPeriodKey, getPeriodLabel, type ReportPeriod } from "@/lib/report-periods";

type Period = ReportPeriod;
type TxnType = "CASH_IN" | "CASH_OUT" | "LOAD";

const emptyTotals = () => ({ count: 0, gross: 0, fees: 0 });

export async function GET(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const gate = await requireFeature(session.tenantId, "reports");
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const timeZone = searchParams.get("timeZone") || "Asia/Manila";
    const period: Period = (searchParams.get("period") as Period) || "daily";

    const dateFilter: Record<string, Date> = {};
    if (startDate) dateFilter.gte = new Date(`${startDate}T00:00:00`);
    if (endDate) dateFilter.lte = new Date(`${endDate}T23:59:59`);

    const transactions = await prisma.cashTransaction.findMany({
      where: {
        tenantId: session.tenantId,
        ...(session.storeId ? { storeId: session.storeId } : {}),
        ...(Object.keys(dateFilter).length > 0 ? { createdAt: dateFilter } : {}),
      },
      select: {
        type: true,
        provider: true,
        amount: true,
        serviceFee: true,
        referenceNumber: true,
        customerName: true,
        customerMobile: true,
        createdAt: true,
        user: { select: { firstName: true, lastName: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    const summary: Record<TxnType, { count: number; gross: number; fees: number }> = {
      CASH_IN: emptyTotals(),
      CASH_OUT: emptyTotals(),
      LOAD: emptyTotals(),
    };

    const byProvider = new Map<string, { type: TxnType; provider: string; count: number; gross: number; fees: number }>();
    const periodMap = new Map<string, Record<TxnType, { count: number; gross: number; fees: number }>>();

    for (const t of transactions) {
      const type = t.type as TxnType;
      const amount = Number(t.amount);
      const fee = Number(t.serviceFee);

      summary[type].count += 1;
      summary[type].gross += amount;
      summary[type].fees += fee;

      const providerKey = `${type}:${t.provider}`;
      const providerBucket = byProvider.get(providerKey) ?? { type, provider: t.provider, count: 0, gross: 0, fees: 0 };
      providerBucket.count += 1;
      providerBucket.gross += amount;
      providerBucket.fees += fee;
      byProvider.set(providerKey, providerBucket);

      const periodKey = getPeriodKey(t.createdAt, period, timeZone);
      const periodBucket = periodMap.get(periodKey) ?? { CASH_IN: emptyTotals(), CASH_OUT: emptyTotals(), LOAD: emptyTotals() };
      periodBucket[type].count += 1;
      periodBucket[type].gross += amount;
      periodBucket[type].fees += fee;
      periodMap.set(periodKey, periodBucket);
    }

    const totalFeesEarned = summary.CASH_IN.fees + summary.CASH_OUT.fees + summary.LOAD.fees;
    // Cash-in and Load bring physical cash into the drawer; cash-out sends it back out.
    // Fees are the agent commission the store actually keeps as revenue.
    const netCashImpact = summary.CASH_IN.gross - summary.CASH_OUT.gross + summary.LOAD.gross + totalFeesEarned;

    const trend = Array.from(periodMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, totals]) => ({
        periodKey: key,
        periodLabel: getPeriodLabel(key, period),
        ...totals,
        feesEarned: totals.CASH_IN.fees + totals.CASH_OUT.fees + totals.LOAD.fees,
      }));

    const providerBreakdown = Array.from(byProvider.values()).sort((a, b) => b.gross - a.gross);

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      timeZone,
      period,
      filters: { startDate: startDate || null, endDate: endDate || null },
      summary: {
        cashIn: summary.CASH_IN,
        cashOut: summary.CASH_OUT,
        load: summary.LOAD,
        totalFeesEarned,
        netCashImpact,
        transactionCount: transactions.length,
      },
      providerBreakdown,
      trend,
      transactions: transactions.slice(0, 200).map((t) => ({
        type: t.type,
        provider: t.provider,
        amount: Number(t.amount),
        serviceFee: Number(t.serviceFee),
        referenceNumber: t.referenceNumber,
        customerName: t.customerName,
        customerMobile: t.customerMobile,
        cashierName: `${t.user.firstName} ${t.user.lastName}`.trim(),
        createdAt: t.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error("Error generating cash services report:", error);
    return NextResponse.json({ error: "Failed to generate cash services report" }, { status: 500 });
  }
}
