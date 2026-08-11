import { prisma } from "@/lib/prisma";

export type PeriodType = "daily" | "weekly" | "monthly" | "yearly";

export interface CashPeriodBucket {
  key: string;
  label: string;
  periodStart: string;
  periodEnd: string;
  salesCount: number;
  grossSales: number;
  discountAmount: number;
  netSales: number;
  shiftsCount: number;
  cashVariance: number;
  cashInCount: number;
  cashInTotal: number;
  cashOutCount: number;
  cashOutTotal: number;
  feesEarned: number;
}

const PERIOD_LIMITS: Record<PeriodType, number> = { daily: 14, weekly: 12, monthly: 12, yearly: 5 };

const pad2 = (n: number) => String(n).padStart(2, "0");
const dayKey = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

interface BucketRange {
  key: string;
  label: string;
  periodStart: string;
  periodEnd: string;
  start: Date;
  end: Date; // exclusive
}

function buildRanges(period: PeriodType): BucketRange[] {
  const now = new Date();
  const count = PERIOD_LIMITS[period];
  const ranges: BucketRange[] = [];

  if (period === "daily") {
    for (let i = count - 1; i >= 0; i--) {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1);
      ranges.push({
        key: dayKey(start),
        label: `${MONTH_NAMES[start.getMonth()]} ${start.getDate()}`,
        periodStart: dayKey(start),
        periodEnd: dayKey(start),
        start,
        end,
      });
    }
  } else if (period === "weekly") {
    const dayOfWeek = now.getDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const thisWeekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + mondayOffset);
    for (let i = count - 1; i >= 0; i--) {
      const start = new Date(thisWeekStart.getFullYear(), thisWeekStart.getMonth(), thisWeekStart.getDate() - i * 7);
      const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7);
      const last = new Date(end.getFullYear(), end.getMonth(), end.getDate() - 1);
      ranges.push({
        key: dayKey(start),
        label: `${MONTH_NAMES[start.getMonth()]} ${start.getDate()}–${MONTH_NAMES[last.getMonth()]} ${last.getDate()}`,
        periodStart: dayKey(start),
        periodEnd: dayKey(last),
        start,
        end,
      });
    }
  } else if (period === "monthly") {
    for (let i = count - 1; i >= 0; i--) {
      const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
      const last = new Date(end.getFullYear(), end.getMonth(), end.getDate() - 1);
      ranges.push({
        key: `${start.getFullYear()}-${pad2(start.getMonth() + 1)}`,
        label: `${MONTH_NAMES[start.getMonth()]} ${start.getFullYear()}`,
        periodStart: dayKey(start),
        periodEnd: dayKey(last),
        start,
        end,
      });
    }
  } else {
    for (let i = count - 1; i >= 0; i--) {
      const year = now.getFullYear() - i;
      const start = new Date(year, 0, 1);
      const end = new Date(year + 1, 0, 1);
      ranges.push({
        key: String(year),
        label: String(year),
        periodStart: `${year}-01-01`,
        periodEnd: `${year}-12-31`,
        start,
        end,
      });
    }
  }

  return ranges;
}

function findRangeIndex(ranges: BucketRange[], date: Date): number {
  for (let i = 0; i < ranges.length; i++) {
    if (date >= ranges[i].start && date < ranges[i].end) return i;
  }
  return -1;
}

export async function computeShiftCashReport(
  tenantId: string,
  storeId: string,
  period: PeriodType
): Promise<CashPeriodBucket[]> {
  const ranges = buildRanges(period);
  const overallStart = ranges[0].start;

  const [sales, shifts, cashTransactions] = await Promise.all([
    prisma.sale.findMany({
      where: { tenantId, storeId, saleDate: { gte: overallStart }, status: { not: "CANCELLED" } },
      select: { saleDate: true, subtotal: true, discountAmount: true, totalAmount: true },
    }),
    prisma.shift.findMany({
      where: { tenantId, storeId, closedAt: { gte: overallStart, not: null } },
      select: { closedAt: true, endingCash: true, expectedCash: true },
    }),
    prisma.cashTransaction.findMany({
      where: { tenantId, storeId, createdAt: { gte: overallStart } },
      select: { createdAt: true, type: true, amount: true, serviceFee: true },
    }),
  ]);

  const buckets: CashPeriodBucket[] = ranges.map((r) => ({
    key: r.key,
    label: r.label,
    periodStart: r.periodStart,
    periodEnd: r.periodEnd,
    salesCount: 0,
    grossSales: 0,
    discountAmount: 0,
    netSales: 0,
    shiftsCount: 0,
    cashVariance: 0,
    cashInCount: 0,
    cashInTotal: 0,
    cashOutCount: 0,
    cashOutTotal: 0,
    feesEarned: 0,
  }));

  for (const s of sales) {
    const idx = findRangeIndex(ranges, s.saleDate);
    if (idx === -1) continue;
    buckets[idx].salesCount += 1;
    buckets[idx].grossSales += Number(s.subtotal);
    buckets[idx].discountAmount += Number(s.discountAmount);
    buckets[idx].netSales += Number(s.totalAmount);
  }

  for (const sh of shifts) {
    if (!sh.closedAt) continue;
    const idx = findRangeIndex(ranges, sh.closedAt);
    if (idx === -1) continue;
    buckets[idx].shiftsCount += 1;
    if (sh.endingCash != null && sh.expectedCash != null) {
      buckets[idx].cashVariance += Number(sh.endingCash) - Number(sh.expectedCash);
    }
  }

  for (const t of cashTransactions) {
    const idx = findRangeIndex(ranges, t.createdAt);
    if (idx === -1) continue;
    if (t.type === "CASH_IN") {
      buckets[idx].cashInCount += 1;
      buckets[idx].cashInTotal += Number(t.amount);
    } else {
      buckets[idx].cashOutCount += 1;
      buckets[idx].cashOutTotal += Number(t.amount);
    }
    buckets[idx].feesEarned += Number(t.serviceFee);
  }

  return buckets;
}
