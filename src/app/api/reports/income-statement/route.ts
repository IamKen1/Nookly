import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/session";
import { requireFeature } from "@/lib/plan-gating";

type Period = "daily" | "weekly" | "monthly" | "annually";

function getPeriodKey(date: Date, period: Period, timeZone: string): string {
  const d = new Date(date.toLocaleString("en-US", { timeZone }));
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");

  if (period === "daily") return `${yyyy}-${mm}-${dd}`;
  if (period === "monthly") return `${yyyy}-${mm}`;
  if (period === "annually") return `${yyyy}`;

  const startOfWeek = new Date(d);
  startOfWeek.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  const ws = String(startOfWeek.getMonth() + 1).padStart(2, "0");
  const wd = String(startOfWeek.getDate()).padStart(2, "0");
  return `${startOfWeek.getFullYear()}-W${ws}-${wd}`;
}

function getPeriodLabel(key: string, period: Period): string {
  if (period === "daily") return new Intl.DateTimeFormat("en-PH", { dateStyle: "medium" }).format(new Date(`${key}T00:00:00`));
  if (period === "monthly") {
    const [yyyy, mm] = key.split("-");
    return new Intl.DateTimeFormat("en-PH", { year: "numeric", month: "long" }).format(new Date(Number(yyyy), Number(mm) - 1, 1));
  }
  if (period === "annually") return `Year ${key}`;
  const parts = key.replace("W", "").split("-");
  if (parts.length >= 3) {
    const date = new Date(`${parts[0]}-${parts[1]}-${parts[2]}T00:00:00`);
    const end = new Date(date);
    end.setDate(date.getDate() + 6);
    return `${new Intl.DateTimeFormat("en-PH", { dateStyle: "medium" }).format(date)} – ${new Intl.DateTimeFormat("en-PH", { dateStyle: "medium" }).format(end)}`;
  }
  return key;
}

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
    const period: Period = (searchParams.get("period") as Period) || "monthly";

    const dateFilter: Record<string, Date> = {};
    if (startDate) dateFilter.gte = new Date(`${startDate}T00:00:00`);
    if (endDate) dateFilter.lte = new Date(`${endDate}T23:59:59`);

    const sales = await prisma.sale.findMany({
      where: {
        tenantId: session.tenantId,
        status: "COMPLETED",
        ...(session.storeId ? { storeId: session.storeId } : {}),
        ...(Object.keys(dateFilter).length > 0 ? { saleDate: dateFilter } : {}),
      },
      select: {
        saleDate: true,
        discountAmount: true,
        items: { select: { quantity: true, totalPrice: true, product: { select: { costPrice: true } } } },
      },
      orderBy: { saleDate: "asc" },
    });

    const periodMap = new Map<
      string,
      { periodKey: string; salesCount: number; grossRevenue: number; totalDiscount: number; netRevenue: number; totalCOGS: number; grossProfit: number }
    >();

    let totalGrossRevenue = 0;
    let totalDiscount = 0;
    let totalNetRevenue = 0;
    let totalCOGS = 0;
    let totalSalesCount = 0;

    for (const sale of sales) {
      const key = getPeriodKey(sale.saleDate, period, timeZone);
      const saleRevenue = sale.items.reduce((sum, item) => sum + Number(item.totalPrice), 0);
      const saleDiscount = Number(sale.discountAmount);
      const grossRevenue = saleRevenue + saleDiscount;
      const netRevenue = saleRevenue;
      const cogs = sale.items.reduce((sum, item) => sum + Number(item.product.costPrice) * item.quantity, 0);

      totalGrossRevenue += grossRevenue;
      totalDiscount += saleDiscount;
      totalNetRevenue += netRevenue;
      totalCOGS += cogs;
      totalSalesCount++;

      const existing = periodMap.get(key);
      if (existing) {
        existing.salesCount++;
        existing.grossRevenue += grossRevenue;
        existing.totalDiscount += saleDiscount;
        existing.netRevenue += netRevenue;
        existing.totalCOGS += cogs;
        existing.grossProfit = existing.netRevenue - existing.totalCOGS;
      } else {
        periodMap.set(key, {
          periodKey: key,
          salesCount: 1,
          grossRevenue,
          totalDiscount: saleDiscount,
          netRevenue,
          totalCOGS: cogs,
          grossProfit: netRevenue - cogs,
        });
      }
    }

    const rows = Array.from(periodMap.values()).map((row) => ({
      ...row,
      grossProfitMargin: row.netRevenue > 0 ? Number(((row.grossProfit / row.netRevenue) * 100).toFixed(2)) : 0,
      periodLabel: getPeriodLabel(row.periodKey, period),
    }));

    const grandTotalGrossProfit = totalNetRevenue - totalCOGS;

    const summary = {
      totalSalesCount,
      totalGrossRevenue,
      totalDiscount,
      totalNetRevenue,
      totalCOGS,
      grossProfit: grandTotalGrossProfit,
      grossProfitMargin: totalNetRevenue > 0 ? Number(((grandTotalGrossProfit / totalNetRevenue) * 100).toFixed(2)) : 0,
    };

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      timeZone,
      period,
      filters: { startDate: startDate || null, endDate: endDate || null },
      summary,
      rows,
    });
  } catch (error) {
    console.error("Error generating income statement:", error);
    return NextResponse.json({ error: "Failed to generate income statement" }, { status: 500 });
  }
}
