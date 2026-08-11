import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/session";
import { requireFeature } from "@/lib/plan-gating";

const DAY_MS = 24 * 60 * 60 * 1000;

const startOfDay = (date: Date) => {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
};

export async function GET(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const gate = await requireFeature(session.tenantId, "reports");
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  try {
    const { searchParams } = new URL(request.url);
    const expiryWindowDays = Math.max(1, Math.min(365, Number(searchParams.get("expiryWindowDays") || "90")));

    const now = new Date();
    const today = startOfDay(now);
    const expiryWindowEnd = new Date(today.getTime() + expiryWindowDays * DAY_MS);
    const recentWindowStart = new Date(today.getTime() - 30 * DAY_MS);

    const products = await prisma.product.findMany({
      where: { tenantId: session.tenantId },
      select: {
        id: true,
        name: true,
        genericName: true,
        barcode: true,
        category: { select: { id: true, name: true } },
        createdAt: true,
        updatedAt: true,
        expiryDate: true,
        isActive: true,
        stocks: session.storeId ? { where: { storeId: session.storeId } } : true,
      },
      orderBy: [{ expiryDate: "asc" }, { updatedAt: "desc" }],
    });

    const rows = products.map((product) => {
      const hasExpiry = Boolean(product.expiryDate);
      const expired = Boolean(product.expiryDate && product.expiryDate < today);
      const expiringSoon = Boolean(product.expiryDate && product.expiryDate >= today && product.expiryDate <= expiryWindowEnd);
      const daysToExpiry = product.expiryDate ? Math.ceil((startOfDay(product.expiryDate).getTime() - today.getTime()) / DAY_MS) : null;
      const dateStatus = expired ? "expired" : expiringSoon ? "expiring_soon" : hasExpiry ? "valid" : "no_expiry";

      return {
        id: product.id,
        name: product.name,
        genericName: product.genericName,
        barcode: product.barcode,
        category: product.category,
        isActive: product.isActive,
        currentStock: product.stocks[0]?.currentStock ?? 0,
        createdAt: product.createdAt.toISOString(),
        updatedAt: product.updatedAt.toISOString(),
        expiryDate: product.expiryDate ? product.expiryDate.toISOString() : null,
        daysToExpiry,
        dateStatus,
      };
    });

    const summary = {
      totalProducts: rows.length,
      expired: rows.filter((row) => row.dateStatus === "expired").length,
      expiringSoon: rows.filter((row) => row.dateStatus === "expiring_soon").length,
      noExpiryDate: rows.filter((row) => row.dateStatus === "no_expiry").length,
      recentlyCreated: rows.filter((row) => new Date(row.createdAt) >= recentWindowStart).length,
      recentlyUpdated: rows.filter((row) => new Date(row.updatedAt) >= recentWindowStart).length,
    };

    return NextResponse.json({ generatedAt: now.toISOString(), expiryWindowDays, summary, rows });
  } catch (error) {
    console.error("Error generating inventory date report:", error);
    return NextResponse.json({ error: "Failed to generate inventory date report" }, { status: 500 });
  }
}
