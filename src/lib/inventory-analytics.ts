import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { batchesAtStore } from "@/lib/branch-scope";
import { getInventoryValue } from "@/lib/dashboard-data";

const DAY_MS = 24 * 60 * 60 * 1000;
const money = (n: number) => Math.round(n * 100) / 100;

export type InventoryTab = "stock" | "receiving" | "batches" | "movements" | "branches";

// Low / out of stock at one branch, or across all (null): each branch's own
// count against the product's minimum.
// Counted by the database, so thousands of products don't travel here to be counted.
async function stockAlerts(tenantId: string, storeId: string | null) {
  const rows = await prisma.$queryRaw<{ storeId: string; out: number; low: number }[]>`
    SELECT ps."storeId",
           count(*) FILTER (WHERE ps."currentStock" <= 0)::int AS out,
           count(*) FILTER (WHERE ps."currentStock" > 0 AND ps."currentStock" <= pr."minimumStock")::int AS low
    FROM product_stocks ps
    JOIN products pr ON pr.id = ps."productId"
    JOIN stores s ON s.id = ps."storeId"
    WHERE s."tenantId" = ${tenantId} AND s."isActive" = true AND ps."isHidden" = false AND pr."isActive" = true
      ${storeId ? Prisma.sql`AND ps."storeId" = ${storeId}` : Prisma.empty}
    GROUP BY ps."storeId"`;
  const byStore = (key: "out" | "low") => Object.fromEntries(rows.map((r) => [r.storeId, r[key]]));
  return {
    out: rows.reduce((n, r) => n + r.out, 0),
    low: rows.reduce((n, r) => n + r.low, 0),
    outByStore: byStore("out"),
    lowByStore: byStore("low"),
  };
}

// Lots with stock by expiry, valued at their own cost.
async function expiryHealth(tenantId: string, storeId: string | null) {
  const where = storeId ? await batchesAtStore(tenantId, storeId) : {};
  const primary = storeId ? null : await prisma.store.findFirst({ where: { tenantId }, orderBy: [{ isMainBranch: "desc" }, { createdAt: "asc" }], select: { id: true } });
  const lots = await prisma.productBatch.findMany({
    where: { quantity: { gt: 0 }, product: { tenantId, isActive: true }, ...where },
    select: { storeId: true, quantity: true, costPrice: true, expirationDate: true },
  });
  const now = Date.now();
  const res = { lots: lots.length, expired: 0, expiredValue: 0, within30: 0, within30Value: 0, within90: 0, within90Value: 0, byStore: {} as Record<string, { expired: number; expiredValue: number; within90: number }> };
  for (const l of lots) {
    const value = l.quantity * Number(l.costPrice);
    const days = (l.expirationDate.getTime() - now) / DAY_MS;
    const sid = l.storeId ?? primary?.id ?? "";
    const b = (res.byStore[sid] ??= { expired: 0, expiredValue: 0, within90: 0 });
    if (days < 0) {
      res.expired++;
      res.expiredValue += value;
      b.expired++;
      b.expiredValue += value;
    } else if (days <= 30) {
      res.within30++;
      res.within30Value += value;
      b.within90++;
    } else if (days <= 90) {
      res.within90++;
      res.within90Value += value;
      b.within90++;
    }
  }
  return { ...res, expiredValue: money(res.expiredValue), within30Value: money(res.within30Value), within90Value: money(res.within90Value) };
}

// Figures for the Inventory page's analytics strip, matching the open tab.
// storeId null = every branch (the All branches tab).
export async function inventoryAnalytics(tenantId: string, storeId: string | null, tab: InventoryTab) {
  const since = new Date(Date.now() - 30 * DAY_MS);

  if (tab === "receiving") {
    const deliveries = await prisma.receiving.findMany({
      where: { tenantId, ...(storeId ? { storeId } : {}), receivedAt: { gte: since } },
      select: { totalCost: true, supplier: { select: { name: true } }, items: { select: { quantity: true } } },
    });
    const bySupplier = new Map<string, number>();
    for (const d of deliveries) {
      const name = d.supplier?.name ?? "No supplier";
      bySupplier.set(name, (bySupplier.get(name) ?? 0) + Number(d.totalCost));
    }
    const top = [...bySupplier.entries()].sort((a, b) => b[1] - a[1])[0] ?? null;
    const total = deliveries.reduce((s, d) => s + Number(d.totalCost), 0);
    return {
      tab,
      deliveries: deliveries.length,
      purchases: money(total),
      units: deliveries.reduce((s, d) => s + d.items.reduce((u, i) => u + i.quantity, 0), 0),
      average: deliveries.length ? money(total / deliveries.length) : 0,
      topSupplier: top ? { name: top[0], amount: money(top[1]) } : null,
    };
  }

  if (tab === "batches") return { tab, ...(await expiryHealth(tenantId, storeId)) };

  if (tab === "movements") {
    const rows = await prisma.stockMovement.groupBy({
      by: ["type"],
      where: { tenantId, ...(storeId ? { storeId } : {}), createdAt: { gte: since } },
      _sum: { quantity: true },
      _count: true,
    });
    const sum = (type: string) => rows.find((r) => r.type === type)?._sum.quantity ?? 0;
    const transfers = await prisma.stockMovement.findMany({
      where: { tenantId, ...(storeId ? { storeId } : {}), createdAt: { gte: since }, type: "TRANSFER" },
      select: { quantity: true },
    });
    return {
      tab,
      received: sum("PURCHASE"),
      sold: Math.abs(sum("SALE")),
      transferredIn: transfers.filter((t) => t.quantity > 0).reduce((s, t) => s + t.quantity, 0),
      transferredOut: Math.abs(transfers.filter((t) => t.quantity < 0).reduce((s, t) => s + t.quantity, 0)),
      returnedToSupplier: Math.abs(Math.min(0, sum("RETURN"))),
      writtenOff: Math.abs(sum("EXPIRED")) + Math.abs(sum("DAMAGED")),
      adjusted: sum("ADJUSTMENT"),
      entries: rows.reduce((s, r) => s + r._count, 0),
    };
  }

  // Stock levels, and the All branches tab (with a per-branch breakdown).
  const [value, alerts, expiry, productCount] = await Promise.all([
    getInventoryValue({ session: { tenantId }, storeId }),
    stockAlerts(tenantId, storeId),
    tab === "branches" ? expiryHealth(tenantId, null) : null,
    prisma.product.count({ where: { tenantId, isActive: true } }),
  ]);
  return {
    tab,
    cost: money(value.cost),
    retail: money(value.retail),
    expiredCost: money(value.expiredCost),
    units: value.units,
    productsInStock: value.products,
    productCount,
    low: alerts.low,
    out: alerts.out,
    branches:
      tab === "branches"
        ? value.branches.map((b) => ({
            id: b.id,
            name: b.name,
            cost: money(b.cost),
            retail: money(b.retail),
            units: b.units,
            low: alerts.lowByStore[b.id] ?? 0,
            out: alerts.outByStore[b.id] ?? 0,
            expiringSoon: expiry?.byStore[b.id]?.within90 ?? 0,
            expiredValue: money(expiry?.byStore[b.id]?.expiredValue ?? 0),
          }))
        : undefined,
  };
}
