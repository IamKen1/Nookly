import { prisma } from "@/lib/prisma";
import type { ReportResult } from "./registry";
import { type ReportContext, DAY_MS, batchWhere, money, storeName, storeWhere } from "./context";

const n = (v: unknown) => Number(v ?? 0);
const multi = (ctx: ReportContext) => ctx.storeIds?.length !== 1;

// On-hand stock per product and branch, valued at each lot's own cost (units
// not covered by a lot use the product's cost) and at the branch's price.
async function stockPositions(ctx: ReportContext) {
  const [stocks, batches] = await Promise.all([
    prisma.productStock.findMany({
      where: { ...storeWhere(ctx), store: { tenantId: ctx.tenantId }, product: { isActive: true, tenantId: ctx.tenantId } },
      select: {
        storeId: true,
        currentStock: true,
        sellingPrice: true,
        isHidden: true,
        product: {
          select: {
            id: true,
            name: true,
            costPrice: true,
            sellingPrice: true,
            minimumStock: true,
            reorderPoint: true,
            maximumStock: true,
            category: { select: { name: true } },
            suppliers: { select: { supplier: { select: { name: true } } }, take: 1 },
          },
        },
      },
    }),
    prisma.productBatch.findMany({ where: { quantity: { gt: 0 }, product: { tenantId: ctx.tenantId }, ...batchWhere(ctx) }, select: { productId: true, storeId: true, quantity: true, costPrice: true } }),
  ]);
  const lots = new Map<string, { quantity: number; cost: number }[]>();
  for (const b of batches) {
    const key = `${b.productId}:${b.storeId ?? ctx.primaryStoreId}`;
    lots.set(key, [...(lots.get(key) ?? []), { quantity: b.quantity, cost: n(b.costPrice) }]);
  }
  return stocks.map((s) => {
    let left = Math.max(0, s.currentStock);
    let cost = 0;
    for (const l of lots.get(`${s.product.id}:${s.storeId}`) ?? []) {
      if (left <= 0) break;
      const u = Math.min(left, l.quantity);
      cost += u * l.cost;
      left -= u;
    }
    cost += left * n(s.product.costPrice);
    const price = n(s.sellingPrice ?? s.product.sellingPrice);
    return {
      productId: s.product.id,
      product: s.product.name,
      category: s.product.category?.name ?? "Uncategorized",
      supplier: s.product.suppliers[0]?.supplier.name ?? "",
      storeId: s.storeId,
      branch: storeName(ctx, s.storeId),
      onHand: s.currentStock,
      hidden: s.isHidden,
      cost,
      price,
      retail: Math.max(0, s.currentStock) * price,
      minimum: s.product.minimumStock,
      reorderPoint: s.product.reorderPoint,
      maximum: s.product.maximumStock,
    };
  });
}

export async function inventoryValuation(ctx: ReportContext): Promise<ReportResult> {
  const rows = (await stockPositions(ctx))
    .filter((p) => p.onHand > 0)
    .map((p) => ({
      product: p.product,
      category: p.category,
      branch: p.branch,
      onHand: p.onHand,
      unitCost: p.onHand ? money(p.cost / p.onHand) : 0,
      cost: money(p.cost),
      price: money(p.price),
      retail: money(p.retail),
      profit: money(p.retail - p.cost),
    }))
    .sort((a, b) => b.cost - a.cost);
  const cost = rows.reduce((s, r) => s + r.cost, 0);
  const retail = rows.reduce((s, r) => s + r.retail, 0);
  return {
    summary: [
      { label: "Cost of inventory", value: money(cost), format: "money" },
      { label: "At selling price", value: money(retail), format: "money" },
      { label: "Potential profit", value: money(retail - cost), format: "money" },
      { label: "Units on hand", value: rows.reduce((s, r) => s + r.onHand, 0), format: "int" },
    ],
    columns: [
      { key: "product", label: "Product" },
      { key: "category", label: "Category" },
      ...(multi(ctx) ? [{ key: "branch", label: "Branch" }] : []),
      { key: "onHand", label: "On hand", format: "int", total: true },
      { key: "unitCost", label: "Avg unit cost", format: "money" },
      { key: "cost", label: "Cost value", format: "money", total: true },
      { key: "price", label: "Selling price", format: "money" },
      { key: "retail", label: "Retail value", format: "money", total: true },
      { key: "profit", label: "Potential profit", format: "money", total: true },
    ],
    rows,
    note: "As of now. Cost value uses each lot's purchase cost; units without a lot use the product's cost price.",
  };
}

// Units sold per product and branch over the last `days` days (net of returns).
async function velocity(ctx: ReportContext, since: Date, until: Date) {
  const items = await prisma.saleItem.findMany({
    where: {
      sale: {
        tenantId: ctx.tenantId,
        ...storeWhere(ctx),
        saleDate: { gte: since, lt: until },
        status: { in: ["COMPLETED", "RETURNED"] },
      },
    },
    select: { productId: true, quantity: true, sale: { select: { storeId: true, originalSaleId: true } } },
  });
  const sold = new Map<string, number>();
  for (const i of items) {
    const key = `${i.productId}:${i.sale.storeId}`;
    sold.set(key, (sold.get(key) ?? 0) + (i.sale.originalSaleId ? -i.quantity : i.quantity));
  }
  return sold;
}

export async function reorder(ctx: ReportContext): Promise<ReportResult> {
  const now = new Date();
  const [positions, sold] = await Promise.all([stockPositions(ctx), velocity(ctx, new Date(now.getTime() - 30 * DAY_MS), now)]);
  const rows = positions
    .filter((p) => !p.hidden)
    .map((p) => {
      const sold30 = Math.max(0, sold.get(`${p.productId}:${p.storeId}`) ?? 0);
      const daily = sold30 / 30;
      const cover = daily > 0 ? Math.max(0, p.onHand) / daily : null;
      // Order up to the maximum if one is set, else to 30 days of sales (at least twice the minimum).
      const target = p.maximum ?? Math.max(Math.ceil(daily * 30), p.minimum * 2, p.reorderPoint);
      const trigger = Math.max(p.minimum, p.reorderPoint);
      const needs = p.onHand <= trigger || (cover !== null && cover < 7);
      return {
        needs,
        product: p.product,
        branch: p.branch,
        supplier: p.supplier,
        onHand: p.onHand,
        minimum: p.minimum,
        reorderPoint: p.reorderPoint,
        sold30,
        daily: money(daily),
        cover: cover === null ? null : Math.round(cover),
        suggest: Math.max(0, target - Math.max(0, p.onHand)),
        estCost: money(Math.max(0, target - Math.max(0, p.onHand)) * (p.onHand > 0 ? p.cost / p.onHand : 0)),
        status: p.onHand <= 0 ? "Out of stock" : p.onHand <= trigger ? "At/below reorder level" : "Runs out within 7 days",
      };
    })
    .filter((r) => r.needs && r.suggest > 0)
    .sort((a, b) => (a.onHand <= 0 ? -1 : 0) - (b.onHand <= 0 ? -1 : 0) || (a.cover ?? 999) - (b.cover ?? 999))
    .map(({ needs, ...r }) => (void needs, r));
  return {
    summary: [
      { label: "Items to reorder", value: rows.length, format: "int" },
      { label: "Out of stock", value: rows.filter((r) => r.onHand <= 0).length, format: "int" },
      { label: "Units to order", value: rows.reduce((s, r) => s + r.suggest, 0), format: "int" },
    ],
    columns: [
      { key: "product", label: "Product" },
      ...(multi(ctx) ? [{ key: "branch", label: "Branch" }] : []),
      { key: "supplier", label: "Supplier" },
      { key: "status", label: "Status" },
      { key: "onHand", label: "On hand", format: "int" },
      { key: "minimum", label: "Min", format: "int" },
      { key: "reorderPoint", label: "Reorder pt", format: "int" },
      { key: "sold30", label: "Sold (30d)", format: "int" },
      { key: "daily", label: "Avg/day", format: "qty" },
      { key: "cover", label: "Days of cover", format: "int" },
      { key: "suggest", label: "Suggested order", format: "int", total: true },
    ],
    rows,
    note: "As of now, from the last 30 days of sales. Suggested order brings stock up to the product's maximum, or to 30 days of sales (at least twice the minimum) when no maximum is set.",
  };
}

export async function expiry(ctx: ReportContext): Promise<ReportResult> {
  const lots = await prisma.productBatch.findMany({
    where: { quantity: { gt: 0 }, product: { tenantId: ctx.tenantId, isActive: true }, ...batchWhere(ctx) },
    select: {
      batchNumber: true,
      expirationDate: true,
      quantity: true,
      costPrice: true,
      storeId: true,
      product: { select: { name: true } },
      supplier: { select: { name: true } },
    },
    orderBy: { expirationDate: "asc" },
    take: 10000,
  });
  const now = Date.now();
  const rows = lots.map((l) => {
    const days = Math.ceil((l.expirationDate.getTime() - now) / DAY_MS);
    return {
      product: l.product.name,
      batch: l.batchNumber,
      branch: storeName(ctx, l.storeId ?? ctx.primaryStoreId),
      supplier: l.supplier?.name ?? "",
      expiry: l.expirationDate.toISOString(),
      days,
      status: days < 0 ? "Expired" : days <= 30 ? "≤ 30 days" : days <= 90 ? "31–90 days" : days <= 180 ? "91–180 days" : "Over 180 days",
      quantity: l.quantity,
      value: money(l.quantity * n(l.costPrice)),
    };
  });
  const sumWhere = (f: (r: (typeof rows)[number]) => boolean) => money(rows.filter(f).reduce((s, r) => s + r.value, 0));
  return {
    summary: [
      { label: "Expired (value)", value: sumWhere((r) => r.days < 0), format: "money" },
      { label: "Expiring ≤ 30 days", value: sumWhere((r) => r.days >= 0 && r.days <= 30), format: "money" },
      { label: "Expiring 31–90 days", value: sumWhere((r) => r.days > 30 && r.days <= 90), format: "money" },
      { label: "Lots with stock", value: rows.length, format: "int" },
    ],
    columns: [
      { key: "product", label: "Product" },
      { key: "batch", label: "Batch / lot" },
      ...(multi(ctx) ? [{ key: "branch", label: "Branch" }] : []),
      { key: "supplier", label: "Supplier" },
      { key: "expiry", label: "Expiry", format: "date" },
      { key: "days", label: "Days left", format: "int" },
      { key: "status", label: "Status" },
      { key: "quantity", label: "Qty", format: "int", total: true },
      { key: "value", label: "Value at cost", format: "money", total: true },
    ],
    rows,
    note: "As of now, soonest expiry first. Return near-expiry lots to suppliers while they still accept them.",
  };
}

export async function slowMoving(ctx: ReportContext): Promise<ReportResult> {
  const [positions, sold, lastSales] = await Promise.all([
    stockPositions(ctx),
    velocity(ctx, ctx.from, ctx.to),
    // Last sale date per product at the covered branches.
    ctx.storeIds
      ? prisma.$queryRaw<{ productId: string; last: Date }[]>`
          SELECT si."productId", MAX(s."saleDate") AS last FROM "sale_items" si JOIN "sales" s ON s."id" = si."saleId"
          WHERE s."tenantId" = ${ctx.tenantId} AND s."originalSaleId" IS NULL AND s."status" IN ('COMPLETED', 'RETURNED')
            AND s."storeId" = ANY(${ctx.storeIds}) GROUP BY si."productId"`
      : prisma.$queryRaw<{ productId: string; last: Date }[]>`
          SELECT si."productId", MAX(s."saleDate") AS last FROM "sale_items" si JOIN "sales" s ON s."id" = si."saleId"
          WHERE s."tenantId" = ${ctx.tenantId} AND s."originalSaleId" IS NULL AND s."status" IN ('COMPLETED', 'RETURNED')
          GROUP BY si."productId"`,
  ]);
  const lastSold = new Map(lastSales.map((r) => [r.productId, new Date(r.last)]));
  const periodDays = Math.max(1, Math.round((ctx.to.getTime() - ctx.from.getTime()) / DAY_MS));
  const rows = positions
    .filter((p) => p.onHand > 0)
    .map((p) => {
      const units = Math.max(0, sold.get(`${p.productId}:${p.storeId}`) ?? 0);
      const last = lastSold.get(p.productId) ?? null;
      const cover = units > 0 ? Math.round(p.onHand / (units / periodDays)) : null;
      return {
        product: p.product,
        category: p.category,
        branch: p.branch,
        onHand: p.onHand,
        value: money(p.cost),
        sold: units,
        lastSold: last ? last.toISOString() : null,
        idle: last ? Math.floor((Date.now() - last.getTime()) / DAY_MS) : null,
        cover,
      };
    })
    // No sales in the period, or more than 6 months of stock at this pace.
    .filter((r) => r.sold === 0 || (r.cover !== null && r.cover > 180))
    .sort((a, b) => a.sold - b.sold || b.value - a.value);
  return {
    summary: [
      { label: "Slow / not moving", value: rows.length, format: "int" },
      { label: "No sales in period", value: rows.filter((r) => r.sold === 0).length, format: "int" },
      { label: "Value tied up", value: money(rows.reduce((s, r) => s + r.value, 0)), format: "money" },
    ],
    columns: [
      { key: "product", label: "Product" },
      { key: "category", label: "Category" },
      ...(multi(ctx) ? [{ key: "branch", label: "Branch" }] : []),
      { key: "onHand", label: "On hand", format: "int", total: true },
      { key: "value", label: "Value at cost", format: "money", total: true },
      { key: "sold", label: "Sold in period", format: "int", total: true },
      { key: "lastSold", label: "Last sold", format: "date" },
      { key: "idle", label: "Days since sold", format: "int" },
      { key: "cover", label: "Days of stock", format: "int" },
    ],
    rows,
    note: "Products with stock that sold nothing in the period, or have more than 6 months of stock at the period's pace.",
  };
}

const MOVEMENT_LABELS: Record<string, string> = {
  PURCHASE: "Received",
  SALE: "Sale",
  ADJUSTMENT: "Adjustment",
  RETURN: "Return",
  EXPIRED: "Expired write-off",
  DAMAGED: "Damaged write-off",
  TRANSFER: "Transfer",
};

export async function stockMovement(ctx: ReportContext): Promise<ReportResult> {
  const moves = await prisma.stockMovement.findMany({
    where: { tenantId: ctx.tenantId, ...storeWhere(ctx), createdAt: { gte: ctx.from, lt: ctx.to } },
    select: {
      createdAt: true,
      type: true,
      quantity: true,
      reason: true,
      reference: true,
      storeId: true,
      product: { select: { name: true } },
      user: { select: { firstName: true, lastName: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 10000,
  });
  const rows = moves.map((m) => ({
    date: m.createdAt.toISOString(),
    product: m.product.name,
    type: MOVEMENT_LABELS[m.type] ?? m.type,
    in: m.quantity > 0 ? m.quantity : null,
    out: m.quantity < 0 ? -m.quantity : null,
    reason: m.reason ?? "",
    reference: m.reference ?? "",
    branch: storeName(ctx, m.storeId),
    by: `${m.user.firstName} ${m.user.lastName}`.trim(),
  }));
  const byType = new Map<string, number>();
  for (const m of moves) byType.set(m.type, (byType.get(m.type) ?? 0) + m.quantity);
  return {
    summary: [
      { label: "Entries", value: rows.length, format: "int" },
      { label: "Units in", value: rows.reduce((s, r) => s + (r.in ?? 0), 0), format: "int" },
      { label: "Units out", value: rows.reduce((s, r) => s + (r.out ?? 0), 0), format: "int" },
      { label: "Written off", value: Math.abs((byType.get("EXPIRED") ?? 0) + (byType.get("DAMAGED") ?? 0)), format: "int" },
    ],
    columns: [
      { key: "date", label: "Date", format: "datetime" },
      { key: "product", label: "Product" },
      { key: "type", label: "Type" },
      { key: "in", label: "In", format: "int", total: true },
      { key: "out", label: "Out", format: "int", total: true },
      { key: "reference", label: "Reference" },
      { key: "reason", label: "Details" },
      ...(multi(ctx) ? [{ key: "branch", label: "Branch" }] : []),
      { key: "by", label: "By" },
    ],
    rows,
  };
}

export async function transfers(ctx: ReportContext): Promise<ReportResult> {
  const moves = await prisma.stockMovement.findMany({
    where: { tenantId: ctx.tenantId, type: "TRANSFER", createdAt: { gte: ctx.from, lt: ctx.to } },
    select: { createdAt: true, quantity: true, reference: true, storeId: true, productId: true, product: { select: { name: true } }, user: { select: { firstName: true, lastName: true } } },
    orderBy: { createdAt: "desc" },
    take: 10000,
  });
  // Each transfer is an "out" at the sending branch and an "in" at the receiving one.
  const ins = moves.filter((m) => m.quantity > 0);
  const rows = moves
    .filter((m) => m.quantity < 0)
    .map((out) => {
      const match = ins.find((i) => i.reference === out.reference && i.productId === out.productId && i.quantity === -out.quantity);
      return {
        date: out.createdAt.toISOString(),
        reference: out.reference ?? "",
        product: out.product.name,
        quantity: -out.quantity,
        from: storeName(ctx, out.storeId),
        to: match ? storeName(ctx, match.storeId) : "—",
        by: `${out.user.firstName} ${out.user.lastName}`.trim(),
        fromId: out.storeId,
        toId: match?.storeId ?? null,
      };
    })
    .filter((r) => !ctx.storeIds || ctx.storeIds.includes(r.fromId) || (r.toId && ctx.storeIds.includes(r.toId)))
    .map(({ fromId, toId, ...r }) => (void fromId, void toId, r));
  return {
    summary: [
      { label: "Transfer lines", value: rows.length, format: "int" },
      { label: "Units moved", value: rows.reduce((s, r) => s + r.quantity, 0), format: "int" },
      { label: "Transfers", value: new Set(rows.map((r) => r.reference)).size, format: "int" },
    ],
    columns: [
      { key: "date", label: "Date", format: "datetime" },
      { key: "reference", label: "Reference" },
      { key: "product", label: "Product" },
      { key: "quantity", label: "Qty", format: "int", total: true },
      { key: "from", label: "From" },
      { key: "to", label: "To" },
      { key: "by", label: "By" },
    ],
    rows,
  };
}

