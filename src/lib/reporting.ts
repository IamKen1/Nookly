import { prisma } from "@/lib/prisma";

export type PeriodType = "daily" | "weekly" | "monthly" | "annually";

export interface SummaryBucket {
  key: string;
  label: string;
  periodStart: string;
  periodEnd: string;
  salesCount: number;
  unitsSold: number;
  grossSales: number;
  discountAmount: number;
  taxAmount: number;
  netSales: number;
  averageSale: number;
}

type SummaryAccumulator = Omit<SummaryBucket, "averageSale">;

export interface TopProductReportItem {
  productId: string;
  productName: string;
  genericName: string | null;
  categoryName: string | null;
  unitsSold: number;
  salesCount: number;
  revenue: number;
}

export interface PaymentMethodReportItem {
  method: string;
  label: string;
  salesCount: number;
  totalAmount: number;
}

export interface CategorySalesReportItem {
  categoryName: string;
  unitsSold: number;
  revenue: number;
}

export interface RecentSaleReportItem {
  saleId: string;
  saleNumber: string;
  saleDate: string;
  paymentMethod: string;
  totalAmount: number;
  itemCount: number;
  cashierName: string;
}

export interface ReportFilters {
  startDate: string | null;
  endDate: string | null;
}

export interface SalesDashboardReport {
  generatedAt: string;
  timeZone: string;
  filters: ReportFilters;
  rangeSummary: SummaryBucket;
  overview: Record<PeriodType, SummaryBucket>;
  breakdowns: Record<PeriodType, SummaryBucket[]>;
  topProducts: TopProductReportItem[];
  paymentMethods: PaymentMethodReportItem[];
  categorySales: CategorySalesReportItem[];
  recentSales: RecentSaleReportItem[];
}

const PERIOD_LIMITS: Record<PeriodType, number> = { daily: 14, weekly: 12, monthly: 12, annually: 5 };

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: "Cash",
  CREDIT_CARD: "Credit Card",
  DEBIT_CARD: "Debit Card",
  INSURANCE: "Insurance",
  CHECK: "Check",
  SPLIT: "Split",
};

const zeroSummary = (key: string, label: string, periodStart: string, periodEnd: string): SummaryBucket => ({
  key,
  label,
  periodStart,
  periodEnd,
  salesCount: 0,
  unitsSold: 0,
  grossSales: 0,
  discountAmount: 0,
  taxAmount: 0,
  netSales: 0,
  averageSale: 0,
});

const finalizeSummary = (summary: SummaryAccumulator): SummaryBucket => ({
  ...summary,
  averageSale: summary.salesCount > 0 ? summary.netSales / summary.salesCount : 0,
});

const toNumber = (value: unknown): number => {
  const numericValue = Number(value ?? 0);
  return Number.isFinite(numericValue) ? numericValue : 0;
};

const parseDateParts = (value: string | null | undefined) => {
  if (!value) return null;
  const [yearText, monthText, dayText] = value.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (!year || !month || !day) return null;
  return { year, month, day };
};

const parseStartDate = (value: string | null | undefined): Date | null => {
  const parts = parseDateParts(value);
  if (!parts) return null;
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 0, 0, 0, 0));
};

const parseEndDate = (value: string | null | undefined): Date | null => {
  const parts = parseDateParts(value);
  if (!parts) return null;
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 23, 59, 59, 999));
};

export const validateTimeZone = (timeZone: string | null): string => {
  if (!timeZone) return "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
    return timeZone;
  } catch {
    return "UTC";
  }
};

const getLocalDateParts = (date: Date, timeZone: string) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { year: Number(values.year), month: Number(values.month), day: Number(values.day) };
};

const getFloatingDate = (year: number, month: number, day: number): Date => new Date(Date.UTC(year, month - 1, day));

const addDays = (date: Date, days: number): Date => {
  const nextDate = new Date(date);
  nextDate.setUTCDate(nextDate.getUTCDate() + days);
  return nextDate;
};

const getWeekStart = (date: Date): Date => {
  const dayOfWeek = date.getUTCDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  return addDays(date, mondayOffset);
};

const formatDayKey = (date: Date): string => date.toISOString().slice(0, 10);
const formatMonthKey = (year: number, month: number): string => `${year}-${String(month).padStart(2, "0")}`;

const formatFloatingDate = (date: Date, options: Intl.DateTimeFormatOptions): string =>
  new Intl.DateTimeFormat("en-PH", { ...options, timeZone: "UTC" }).format(date);

const getLastDayOfMonth = (year: number, month: number): Date => new Date(Date.UTC(year, month, 0));

const getMonthMeta = (year: number, month: number) => {
  const startDate = getFloatingDate(year, month, 1);
  const endDate = getLastDayOfMonth(year, month);
  const key = formatMonthKey(year, month);
  return {
    key,
    label: formatFloatingDate(startDate, { month: "short", year: "numeric" }),
    periodStart: key,
    periodEnd: formatDayKey(endDate),
  };
};

const getYearMeta = (year: number) => ({
  key: String(year),
  label: String(year),
  periodStart: `${year}-01-01`,
  periodEnd: `${year}-12-31`,
});

const getDailyMeta = (date: Date) => ({
  key: formatDayKey(date),
  label: formatFloatingDate(date, { month: "short", day: "numeric", year: "numeric" }),
  periodStart: formatDayKey(date),
  periodEnd: formatDayKey(date),
});

const getWeeklyMeta = (weekStart: Date) => {
  const weekEnd = addDays(weekStart, 6);
  const startLabel = formatFloatingDate(weekStart, { month: "short", day: "numeric" });
  const endLabel = formatFloatingDate(weekEnd, { month: "short", day: "numeric", year: "numeric" });
  return {
    key: formatDayKey(weekStart),
    label: `${startLabel} - ${endLabel}`,
    periodStart: formatDayKey(weekStart),
    periodEnd: formatDayKey(weekEnd),
  };
};

const createAccumulator = (meta: { key: string; label: string; periodStart: string; periodEnd: string }): SummaryAccumulator => ({
  key: meta.key,
  label: meta.label,
  periodStart: meta.periodStart,
  periodEnd: meta.periodEnd,
  salesCount: 0,
  unitsSold: 0,
  grossSales: 0,
  discountAmount: 0,
  taxAmount: 0,
  netSales: 0,
});

const addSaleToBucket = (
  target: Map<string, SummaryAccumulator>,
  meta: { key: string; label: string; periodStart: string; periodEnd: string },
  values: { grossSales: number; discountAmount: number; taxAmount: number; netSales: number; unitsSold: number }
) => {
  const bucket = target.get(meta.key) ?? createAccumulator(meta);
  bucket.salesCount += 1;
  bucket.unitsSold += values.unitsSold;
  bucket.grossSales += values.grossSales;
  bucket.discountAmount += values.discountAmount;
  bucket.taxAmount += values.taxAmount;
  bucket.netSales += values.netSales;
  target.set(meta.key, bucket);
};

const shiftMonth = (year: number, month: number, offset: number) => {
  const shiftedDate = new Date(Date.UTC(year, month - 1 + offset, 1));
  return { year: shiftedDate.getUTCFullYear(), month: shiftedDate.getUTCMonth() + 1 };
};

const buildDailyBreakdown = (dailyMap: Map<string, SummaryAccumulator>, currentDay: Date): SummaryBucket[] => {
  const breakdown: SummaryBucket[] = [];
  for (let index = 0; index < PERIOD_LIMITS.daily; index += 1) {
    const day = addDays(currentDay, -index);
    const meta = getDailyMeta(day);
    breakdown.push(finalizeSummary(dailyMap.get(meta.key) ?? zeroSummary(meta.key, meta.label, meta.periodStart, meta.periodEnd)));
  }
  return breakdown;
};

const buildWeeklyBreakdown = (weeklyMap: Map<string, SummaryAccumulator>, currentWeekStart: Date): SummaryBucket[] => {
  const breakdown: SummaryBucket[] = [];
  for (let index = 0; index < PERIOD_LIMITS.weekly; index += 1) {
    const weekStart = addDays(currentWeekStart, -(index * 7));
    const meta = getWeeklyMeta(weekStart);
    breakdown.push(finalizeSummary(weeklyMap.get(meta.key) ?? zeroSummary(meta.key, meta.label, meta.periodStart, meta.periodEnd)));
  }
  return breakdown;
};

const buildMonthlyBreakdown = (monthlyMap: Map<string, SummaryAccumulator>, currentYear: number, currentMonth: number): SummaryBucket[] => {
  const breakdown: SummaryBucket[] = [];
  for (let index = 0; index < PERIOD_LIMITS.monthly; index += 1) {
    const { year, month } = shiftMonth(currentYear, currentMonth, -index);
    const meta = getMonthMeta(year, month);
    breakdown.push(finalizeSummary(monthlyMap.get(meta.key) ?? zeroSummary(meta.key, meta.label, meta.periodStart, meta.periodEnd)));
  }
  return breakdown;
};

const buildAnnualBreakdown = (annualMap: Map<string, SummaryAccumulator>, currentYear: number): SummaryBucket[] => {
  const breakdown: SummaryBucket[] = [];
  for (let index = 0; index < PERIOD_LIMITS.annually; index += 1) {
    const year = currentYear - index;
    const meta = getYearMeta(year);
    breakdown.push(finalizeSummary(annualMap.get(meta.key) ?? zeroSummary(meta.key, meta.label, meta.periodStart, meta.periodEnd)));
  }
  return breakdown;
};

export const generateSalesDashboardReport = async (
  tenantId: string,
  requestedTimeZone: string | null,
  filters?: Partial<ReportFilters>,
  storeId?: string | null
): Promise<SalesDashboardReport> => {
  const timeZone = validateTimeZone(requestedTimeZone);
  const startDate = filters?.startDate ?? null;
  const endDate = filters?.endDate ?? null;
  const parsedStartDate = parseStartDate(startDate);
  const parsedEndDate = parseEndDate(endDate);

  const where = {
    tenantId,
    status: "COMPLETED" as const,
    ...(storeId ? { storeId } : {}),
    ...(parsedStartDate || parsedEndDate
      ? {
          saleDate: {
            ...(parsedStartDate ? { gte: parsedStartDate } : {}),
            ...(parsedEndDate ? { lte: parsedEndDate } : {}),
          },
        }
      : {}),
  };

  const sales = await prisma.sale.findMany({
    where,
    select: {
      id: true,
      saleNumber: true,
      saleDate: true,
      paymentMethod: true,
      subtotal: true,
      discountAmount: true,
      taxAmount: true,
      totalAmount: true,
      user: { select: { firstName: true, lastName: true } },
      items: {
        select: {
          quantity: true,
          totalPrice: true,
          product: { select: { id: true, name: true, genericName: true, category: { select: { name: true } } } },
        },
      },
    },
    orderBy: { saleDate: "desc" },
  });

  const dailyMap = new Map<string, SummaryAccumulator>();
  const weeklyMap = new Map<string, SummaryAccumulator>();
  const monthlyMap = new Map<string, SummaryAccumulator>();
  const annualMap = new Map<string, SummaryAccumulator>();
  const rangeSummary = createAccumulator({
    key: "selected-range",
    label: startDate || endDate ? `${startDate ?? "Beginning"} to ${endDate ?? "Today"}` : "All Completed Sales",
    periodStart: startDate ?? "All",
    periodEnd: endDate ?? "Today",
  });
  const topProductsMap = new Map<string, TopProductReportItem>();
  const paymentMethodMap = new Map<string, PaymentMethodReportItem>();
  const categorySalesMap = new Map<string, CategorySalesReportItem>();

  for (const sale of sales) {
    const localParts = getLocalDateParts(sale.saleDate, timeZone);
    const floatingDay = getFloatingDate(localParts.year, localParts.month, localParts.day);
    const weekStart = getWeekStart(floatingDay);
    const unitsSold = sale.items.reduce((total, item) => total + item.quantity, 0);
    const grossSales = toNumber(sale.subtotal);
    const discountAmount = toNumber(sale.discountAmount);
    const taxAmount = toNumber(sale.taxAmount);
    const netSales = toNumber(sale.totalAmount);
    const values = { grossSales, discountAmount, taxAmount, netSales, unitsSold };

    rangeSummary.salesCount += 1;
    rangeSummary.unitsSold += unitsSold;
    rangeSummary.grossSales += grossSales;
    rangeSummary.discountAmount += discountAmount;
    rangeSummary.taxAmount += taxAmount;
    rangeSummary.netSales += netSales;

    addSaleToBucket(dailyMap, getDailyMeta(floatingDay), values);
    addSaleToBucket(weeklyMap, getWeeklyMeta(weekStart), values);
    addSaleToBucket(monthlyMap, getMonthMeta(localParts.year, localParts.month), values);
    addSaleToBucket(annualMap, getYearMeta(localParts.year), values);

    const paymentMethodBucket = paymentMethodMap.get(sale.paymentMethod) ?? {
      method: sale.paymentMethod,
      label: PAYMENT_METHOD_LABELS[sale.paymentMethod] ?? sale.paymentMethod,
      salesCount: 0,
      totalAmount: 0,
    };
    paymentMethodBucket.salesCount += 1;
    paymentMethodBucket.totalAmount += netSales;
    paymentMethodMap.set(sale.paymentMethod, paymentMethodBucket);

    for (const item of sale.items) {
      const productId = item.product.id;
      const itemRevenue = toNumber(item.totalPrice);
      const categoryName = item.product.category?.name ?? "Uncategorized";

      const productBucket = topProductsMap.get(productId) ?? {
        productId,
        productName: item.product.name,
        genericName: item.product.genericName,
        categoryName,
        unitsSold: 0,
        salesCount: 0,
        revenue: 0,
      };
      productBucket.unitsSold += item.quantity;
      productBucket.salesCount += 1;
      productBucket.revenue += itemRevenue;
      topProductsMap.set(productId, productBucket);

      const categoryBucket = categorySalesMap.get(categoryName) ?? { categoryName, unitsSold: 0, revenue: 0 };
      categoryBucket.unitsSold += item.quantity;
      categoryBucket.revenue += itemRevenue;
      categorySalesMap.set(categoryName, categoryBucket);
    }
  }

  const anchorDate = parsedEndDate ?? new Date();
  const currentLocalDate = getLocalDateParts(anchorDate, timeZone);
  const currentDay = getFloatingDate(currentLocalDate.year, currentLocalDate.month, currentLocalDate.day);
  const currentWeekStart = getWeekStart(currentDay);

  const breakdowns = {
    daily: buildDailyBreakdown(dailyMap, currentDay),
    weekly: buildWeeklyBreakdown(weeklyMap, currentWeekStart),
    monthly: buildMonthlyBreakdown(monthlyMap, currentLocalDate.year, currentLocalDate.month),
    annually: buildAnnualBreakdown(annualMap, currentLocalDate.year),
  };

  const topProducts = Array.from(topProductsMap.values())
    .sort((left, right) => right.revenue - left.revenue || right.unitsSold - left.unitsSold)
    .slice(0, 10);

  const paymentMethods = Array.from(paymentMethodMap.values()).sort((left, right) => right.totalAmount - left.totalAmount);

  const categorySales = Array.from(categorySalesMap.values())
    .sort((left, right) => right.revenue - left.revenue)
    .slice(0, 8);

  const recentSales = sales.map((sale) => ({
    saleId: sale.id,
    saleNumber: sale.saleNumber,
    saleDate: sale.saleDate.toISOString(),
    paymentMethod: sale.paymentMethod,
    totalAmount: toNumber(sale.totalAmount),
    itemCount: sale.items.reduce((total, item) => total + item.quantity, 0),
    cashierName: [sale.user.firstName, sale.user.lastName].filter(Boolean).join(" ").trim() || "Unknown User",
  }));

  return {
    generatedAt: new Date().toISOString(),
    timeZone,
    filters: { startDate, endDate },
    rangeSummary: finalizeSummary(rangeSummary),
    overview: {
      daily: breakdowns.daily[0],
      weekly: breakdowns.weekly[0],
      monthly: breakdowns.monthly[0],
      annually: breakdowns.annually[0],
    },
    breakdowns,
    topProducts,
    paymentMethods,
    categorySales,
    recentSales,
  };
};
