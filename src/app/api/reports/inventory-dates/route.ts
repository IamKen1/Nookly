import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/session";
import { requireReport } from "@/lib/plan-gating";

const DAY_MS = 24 * 60 * 60 * 1000;

const startOfDay = (date: Date) => {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
};

export async function GET(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const gate = await requireReport(session.tenantId, "inventory-dates");
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
        // Soonest-expiring batch still holding stock — the same one FEFO sells first.
        batches: {
          where: { quantity: { gt: 0 } },
          orderBy: { expirationDate: "asc" },
          take: 1,
          select: { batchNumber: true, expirationDate: true },
        },
      },
    });

    const rows = products.map((product) => {
      const batch = product.batches[0];
      // Batch dates are the source of truth; product.expiryDate only covers
      // products whose expiry was set before batch tracking (legacy import/migration).
      const expiryDate = batch?.expirationDate ?? product.expiryDate;
      const hasExpiry = Boolean(expiryDate);
      const expired = Boolean(expiryDate && expiryDate < today);
      const expiringSoon = Boolean(expiryDate && expiryDate >= today && expiryDate <= expiryWindowEnd);
      const daysToExpiry = expiryDate ? Math.ceil((startOfDay(expiryDate).getTime() - today.getTime()) / DAY_MS) : null;
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
        expiryDate: expiryDate ? expiryDate.toISOString() : null,
        batchNumber: batch?.batchNumber ?? null,
        daysToExpiry,
        dateStatus,
      };
    });
    rows.sort((a, b) => {
      if (a.expiryDate === b.expiryDate) return b.updatedAt.localeCompare(a.updatedAt);
      if (!a.expiryDate) return 1;
      if (!b.expiryDate) return -1;
      return a.expiryDate.localeCompare(b.expiryDate);
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
