import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/session";
import { requireFeature } from "@/lib/plan-gating";

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

    const dateFilter: Record<string, Date> = {};
    if (startDate) dateFilter.gte = new Date(`${startDate}T00:00:00`);
    if (endDate) dateFilter.lte = new Date(`${endDate}T23:59:59`);

    const saleItems = await prisma.saleItem.findMany({
      where: {
        sale: {
          tenantId: session.tenantId,
          status: "COMPLETED",
          ...(session.storeId ? { storeId: session.storeId } : {}),
          ...(Object.keys(dateFilter).length > 0 ? { saleDate: dateFilter } : {}),
        },
      },
      select: {
        quantity: true,
        totalPrice: true,
        product: { select: { id: true, name: true, genericName: true, costPrice: true, category: { select: { name: true } } } },
      },
      orderBy: { sale: { saleDate: "desc" } },
    });

    const productMap = new Map<
      string,
      {
        productId: string;
        productName: string;
        genericName: string | null;
        categoryName: string;
        unitsSold: number;
        sellingPricePerUnit: number;
        totalRevenue: number;
        totalCost: number;
        grossIncome: number;
      }
    >();

    let grandRevenue = 0;
    let grandCost = 0;

    for (const item of saleItems) {
      const revenue = Number(item.totalPrice);
      const cost = Number(item.product.costPrice) * item.quantity;
      grandRevenue += revenue;
      grandCost += cost;

      const existing = productMap.get(item.product.id);
      if (existing) {
        existing.unitsSold += item.quantity;
        existing.totalRevenue += revenue;
        existing.totalCost += cost;
        existing.sellingPricePerUnit = existing.unitsSold > 0 ? existing.totalRevenue / existing.unitsSold : 0;
        existing.grossIncome = existing.totalRevenue - existing.totalCost;
      } else {
        productMap.set(item.product.id, {
          productId: item.product.id,
          productName: item.product.name,
          genericName: item.product.genericName,
          categoryName: item.product.category?.name ?? "Uncategorized",
          unitsSold: item.quantity,
          sellingPricePerUnit: item.quantity > 0 ? revenue / item.quantity : 0,
          totalRevenue: revenue,
          totalCost: cost,
          grossIncome: revenue - cost,
        });
      }
    }

    const rows = Array.from(productMap.values())
      .map((row) => ({ ...row, marginPercent: row.totalRevenue > 0 ? Number(((row.grossIncome / row.totalRevenue) * 100).toFixed(2)) : 0 }))
      .sort((a, b) => b.grossIncome - a.grossIncome);

    const summary = {
      totalProducts: rows.length,
      totalRevenue: grandRevenue,
      totalCost: grandCost,
      grossIncome: grandRevenue - grandCost,
      overallMarginPercent: grandRevenue > 0 ? Number((((grandRevenue - grandCost) / grandRevenue) * 100).toFixed(2)) : 0,
    };

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      timeZone,
      filters: { startDate: startDate || null, endDate: endDate || null },
      summary,
      rows,
    });
  } catch (error) {
    console.error("Error generating income report:", error);
    return NextResponse.json({ error: "Failed to generate income report" }, { status: 500 });
  }
}
