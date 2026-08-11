import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/session";
import { requireFeature } from "@/lib/plan-gating";

type Period = "daily" | "weekly" | "monthly" | "annually";

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: "Cash",
  CREDIT_CARD: "Credit Card",
  DEBIT_CARD: "Debit Card",
  INSURANCE: "Insurance",
  CHECK: "Check",
  SPLIT: "Split",
};

function getLocalDateStr(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function getPeriodKey(date: Date, period: Period, timeZone: string): string {
  const local = getLocalDateStr(date, timeZone);
  const [yyyy, mm, dd] = local.split("-");
  if (period === "daily") return `${yyyy}-${mm}-${dd}`;
  if (period === "monthly") return `${yyyy}-${mm}`;
  if (period === "annually") return yyyy;

  const d = new Date(date.toLocaleString("en-US", { timeZone }));
  const dow = d.getDay();
  const monday = new Date(d);
  monday.setDate(d.getDate() - ((dow + 6) % 7));
  return getLocalDateStr(monday, timeZone);
}

function getPeriodLabel(key: string, period: Period): string {
  try {
    if (period === "daily") {
      return new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", year: "numeric" }).format(new Date(`${key}T12:00:00Z`));
    }
    if (period === "monthly") {
      const [yyyy, mm] = key.split("-");
      return new Intl.DateTimeFormat("en-PH", { month: "short", year: "numeric" }).format(new Date(Number(yyyy), Number(mm) - 1, 1));
    }
    if (period === "annually") return `Year ${key}`;
    const d = new Date(`${key}T12:00:00Z`);
    const end = new Date(d);
    end.setUTCDate(d.getUTCDate() + 6);
    const fmt = (v: Date) => new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric" }).format(v);
    return `${fmt(d)} – ${fmt(end)}`;
  } catch {
    return key;
  }
}

export async function GET(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const gate = await requireFeature(session.tenantId, "reports");
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  try {
    const { searchParams } = new URL(request.url);
    const startDateStr = searchParams.get("startDate");
    const endDateStr = searchParams.get("endDate");
    const timeZone = searchParams.get("timeZone") || "Asia/Manila";
    const period: Period = (searchParams.get("period") as Period) || "monthly";

    const PERIOD_LIMIT: Record<Period, number> = { daily: 30, weekly: 16, monthly: 12, annually: 5 };

    const dateFilter: Record<string, Date> = {};
    if (startDateStr) dateFilter.gte = new Date(`${startDateStr}T00:00:00`);
    if (endDateStr) dateFilter.lte = new Date(`${endDateStr}T23:59:59`);

    const sales = await prisma.sale.findMany({
      where: {
        tenantId: session.tenantId,
        status: "COMPLETED",
        ...(session.storeId ? { storeId: session.storeId } : {}),
        ...(Object.keys(dateFilter).length > 0 ? { saleDate: dateFilter } : {}),
      },
      select: {
        saleDate: true,
        subtotal: true,
        discountAmount: true,
        taxAmount: true,
        totalAmount: true,
        paymentMethod: true,
        items: {
          select: {
            quantity: true,
            totalPrice: true,
            product: { select: { id: true, name: true, genericName: true, costPrice: true, category: { select: { name: true } } } },
          },
        },
      },
      orderBy: { saleDate: "asc" },
    });

    const trendMap = new Map<
      string,
      {
        periodKey: string;
        periodLabel: string;
        salesCount: number;
        revenue: number;
        discount: number;
        netRevenue: number;
        cogs: number;
        grossProfit: number;
        vatAmount: number;
      }
    >();
    const productMap = new Map<
      string,
      { productId: string; productName: string; genericName: string | null; categoryName: string; unitsSold: number; revenue: number; cogs: number }
    >();
    const categoryMap = new Map<string, { categoryName: string; revenue: number; cogs: number; unitsSold: number }>();
    const paymentMap = new Map<string, { method: string; label: string; salesCount: number; totalAmount: number }>();

    let grandRevenue = 0;
    let grandDiscount = 0;
    let grandNetRevenue = 0;
    let grandCOGS = 0;
    let grandVAT = 0;

    for (const sale of sales) {
      const saleRevenue = sale.items.reduce((s, i) => s + Number(i.totalPrice), 0);
      const saleDiscount = Number(sale.discountAmount);
      const saleGross = saleRevenue + saleDiscount;
      const saleCOGS = sale.items.reduce((s, i) => s + Number(i.product.costPrice) * i.quantity, 0);
      const saleVAT = Number(sale.taxAmount);

      grandRevenue += saleGross;
      grandDiscount += saleDiscount;
      grandNetRevenue += saleRevenue;
      grandCOGS += saleCOGS;
      grandVAT += saleVAT;

      const pkey = getPeriodKey(sale.saleDate, period, timeZone);
      const existing = trendMap.get(pkey);
      if (existing) {
        existing.salesCount++;
        existing.revenue += saleGross;
        existing.discount += saleDiscount;
        existing.netRevenue += saleRevenue;
        existing.cogs += saleCOGS;
        existing.grossProfit = existing.netRevenue - existing.cogs;
        existing.vatAmount += saleVAT;
      } else {
        trendMap.set(pkey, {
          periodKey: pkey,
          periodLabel: getPeriodLabel(pkey, period),
          salesCount: 1,
          revenue: saleGross,
          discount: saleDiscount,
          netRevenue: saleRevenue,
          cogs: saleCOGS,
          grossProfit: saleRevenue - saleCOGS,
          vatAmount: saleVAT,
        });
      }

      for (const item of sale.items) {
        const rev = Number(item.totalPrice);
        const cost = Number(item.product.costPrice) * item.quantity;
        const catName = item.product.category?.name ?? "Uncategorized";

        const pe = productMap.get(item.product.id);
        if (pe) {
          pe.unitsSold += item.quantity;
          pe.revenue += rev;
          pe.cogs += cost;
        } else {
          productMap.set(item.product.id, {
            productId: item.product.id,
            productName: item.product.name,
            genericName: item.product.genericName,
            categoryName: catName,
            unitsSold: item.quantity,
            revenue: rev,
            cogs: cost,
          });
        }

        const ce = categoryMap.get(catName);
        if (ce) {
          ce.revenue += rev;
          ce.cogs += cost;
          ce.unitsSold += item.quantity;
        } else {
          categoryMap.set(catName, { categoryName: catName, revenue: rev, cogs: cost, unitsSold: item.quantity });
        }
      }

      const pm = sale.paymentMethod;
      const pe2 = paymentMap.get(pm);
      if (pe2) {
        pe2.salesCount++;
        pe2.totalAmount += Number(sale.totalAmount);
      } else {
        paymentMap.set(pm, { method: pm, label: PAYMENT_METHOD_LABELS[pm] ?? pm, salesCount: 1, totalAmount: Number(sale.totalAmount) });
      }
    }

    const grandGrossProfit = grandNetRevenue - grandCOGS;

    const summary = {
      totalTransactions: sales.length,
      grossRevenue: grandRevenue,
      totalDiscount: grandDiscount,
      netRevenue: grandNetRevenue,
      totalCOGS: grandCOGS,
      grossProfit: grandGrossProfit,
      grossMarginPercent: grandNetRevenue > 0 ? Number(((grandGrossProfit / grandNetRevenue) * 100).toFixed(1)) : 0,
      vatCollected: grandVAT,
      averageSale: sales.length > 0 ? grandNetRevenue / sales.length : 0,
    };

    const trend = Array.from(trendMap.values())
      .sort((a, b) => a.periodKey.localeCompare(b.periodKey))
      .slice(-PERIOD_LIMIT[period])
      .map((row) => ({
        ...row,
        grossProfitMarginPercent: row.netRevenue > 0 ? Number(((row.grossProfit / row.netRevenue) * 100).toFixed(1)) : 0,
      }));

    const topProductsByProfit = Array.from(productMap.values())
      .map((p) => ({ ...p, grossProfit: p.revenue - p.cogs, marginPercent: p.revenue > 0 ? Number((((p.revenue - p.cogs) / p.revenue) * 100).toFixed(1)) : 0 }))
      .sort((a, b) => b.grossProfit - a.grossProfit)
      .slice(0, 10);

    const topProductsByRevenue = Array.from(productMap.values())
      .map((p) => ({ ...p, grossProfit: p.revenue - p.cogs }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    const categorySales = Array.from(categoryMap.values())
      .map((c) => ({ ...c, grossProfit: c.revenue - c.cogs, marginPercent: c.revenue > 0 ? Number((((c.revenue - c.cogs) / c.revenue) * 100).toFixed(1)) : 0 }))
      .sort((a, b) => b.revenue - a.revenue);

    const paymentMethods = Array.from(paymentMap.values()).sort((a, b) => b.totalAmount - a.totalAmount);

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      timeZone,
      period,
      filters: { startDate: startDateStr || null, endDate: endDateStr || null },
      summary,
      trend,
      topProductsByProfit,
      topProductsByRevenue,
      categorySales,
      paymentMethods,
    });
  } catch (error) {
    console.error("Error generating unified dashboard:", error);
    return NextResponse.json({ error: "Failed to generate dashboard" }, { status: 500 });
  }
}
