import { prisma } from "@/lib/prisma";
import { paymentMethodLabel } from "@/lib/payment-methods";
import type { ReportResult } from "./registry";
import { type ReportContext, daysIn, money, phDay, phHour, phWeekday, saleWhere, storeName } from "./context";

const saleSelect = {
  id: true,
  saleNumber: true,
  saleDate: true,
  status: true,
  storeId: true,
  userId: true,
  subtotal: true,
  discountAmount: true,
  taxAmount: true,
  totalAmount: true,
  vatableSales: true,
  nonVatableSales: true,
  vatableGross: true,
  vatRemovedFromVatable: true,
  discountVatExempt: true,
  discountType: true,
  paymentMethod: true,
  paymentProvider: true,
} as const;

// Sales and returns in the period. Returns carry negative amounts, so adding
// them in gives net figures.
async function loadSales(ctx: ReportContext) {
  const [sales, returns] = await Promise.all([
    prisma.sale.findMany({ where: saleWhere(ctx, "sales"), select: saleSelect }),
    prisma.sale.findMany({ where: saleWhere(ctx, "returns"), select: saleSelect }),
  ]);
  return { sales, returns };
}

const n = (v: unknown) => Number(v ?? 0);

// Line items with their cost: the cost saved at the time of sale, or the
// product's cost price for sales made before costs were saved.
async function loadLines(ctx: ReportContext) {
  const items = await prisma.saleItem.findMany({
    where: { sale: { OR: [saleWhere(ctx, "sales"), saleWhere(ctx, "returns")] } },
    select: {
      quantity: true,
      returnedQuantity: true,
      totalPrice: true,
      unitCost: true,
      sale: { select: { originalSaleId: true, totalAmount: true, subtotal: true } },
      product: { select: { id: true, name: true, costPrice: true, category: { select: { name: true } } } },
    },
  });
  return items.map((i) => {
    const isReturn = i.sale.originalSaleId != null;
    // Each line's share of what the sale actually came to (after its discount
    // and any SC/PWD VAT exemption), so product totals add up to net sales.
    const subtotal = n(i.sale.subtotal);
    const gross = n(i.totalPrice);
    const net = subtotal !== 0 ? gross * (n(i.sale.totalAmount) / subtotal) : gross;
    const qty = isReturn ? -i.quantity : i.quantity;
    const cost = n(i.unitCost ?? i.product.costPrice) * qty;
    return {
      productId: i.product.id,
      name: i.product.name,
      category: i.product.category?.name ?? "Uncategorized",
      soldQty: isReturn ? 0 : i.quantity,
      returnedQty: isReturn ? i.quantity : 0,
      gross,
      net,
      cost,
    };
  });
}

export async function salesSummary(ctx: ReportContext): Promise<ReportResult> {
  const { sales, returns } = await loadSales(ctx);
  const voids = await prisma.sale.aggregate({ where: saleWhere(ctx, "voids"), _count: true, _sum: { totalAmount: true } });
  const days = new Map(daysIn(ctx).map((d) => [d, { date: d, transactions: 0, gross: 0, discounts: 0, vatExempt: 0, returns: 0, net: 0, vat: 0, cash: 0, ewallet: 0, other: 0 }]));
  const row = (d: Date) => days.get(phDay(d));
  for (const s of sales) {
    const r = row(s.saleDate);
    if (!r) continue;
    r.transactions++;
    r.gross += n(s.subtotal);
    r.discounts += n(s.discountAmount);
    r.vatExempt += n(s.vatRemovedFromVatable);
    r.net += n(s.totalAmount);
    r.vat += n(s.taxAmount);
    const bucket = s.paymentMethod === "CASH" ? "cash" : s.paymentMethod === "E_WALLET" ? "ewallet" : "other";
    r[bucket] += n(s.totalAmount);
  }
  for (const s of returns) {
    const r = row(s.saleDate);
    if (!r) continue;
    r.returns += -n(s.totalAmount);
    r.net += n(s.totalAmount);
    r.vat += n(s.taxAmount);
    const bucket = s.paymentMethod === "CASH" ? "cash" : s.paymentMethod === "E_WALLET" ? "ewallet" : "other";
    r[bucket] += n(s.totalAmount);
  }
  const rows = [...days.values()].map((r) => ({
    ...r,
    gross: money(r.gross),
    discounts: money(r.discounts),
    vatExempt: money(r.vatExempt),
    returns: money(r.returns),
    net: money(r.net),
    vat: money(r.vat),
    cash: money(r.cash),
    ewallet: money(r.ewallet),
    other: money(r.other),
    average: r.transactions ? money(r.net / r.transactions) : 0,
  }));
  const t = rows.reduce((a, r) => ({ tx: a.tx + r.transactions, net: a.net + r.net, gross: a.gross + r.gross, ret: a.ret + r.returns }), { tx: 0, net: 0, gross: 0, ret: 0 });
  const hasOther = rows.some((r) => r.other !== 0);
  return {
    summary: [
      { label: "Net sales", value: money(t.net), format: "money" },
      { label: "Transactions", value: t.tx, format: "int" },
      { label: "Average sale", value: t.tx ? money(t.net / t.tx) : 0, format: "money" },
      { label: "Returns", value: money(t.ret), format: "money" },
      { label: "Voided", value: `${voids._count} (${money(n(voids._sum.totalAmount)).toLocaleString("en-PH", { style: "currency", currency: "PHP" })})` },
    ],
    columns: [
      { key: "date", label: "Date", format: "date" },
      { key: "transactions", label: "Trans.", format: "int", total: true },
      { key: "gross", label: "Gross sales", format: "money", total: true },
      { key: "discounts", label: "Discounts", format: "money", total: true },
      { key: "vatExempt", label: "VAT exempt", format: "money", total: true },
      { key: "returns", label: "Returns", format: "money", total: true },
      { key: "net", label: "Net sales", format: "money", total: true },
      { key: "vat", label: "VAT", format: "money", total: true },
      { key: "cash", label: "Cash", format: "money", total: true },
      { key: "ewallet", label: "E-wallet", format: "money", total: true },
      ...(hasOther ? [{ key: "other", label: "Card/other", format: "money" as const, total: true }] : []),
      { key: "average", label: "Avg sale", format: "money" },
    ],
    rows,
    note: "Net sales = gross sales − discounts − VAT exempted on SC/PWD sales − returns. Voided sales are excluded.",
  };
}

export async function salesByProduct(ctx: ReportContext): Promise<ReportResult> {
  const lines = await loadLines(ctx);
  const by = new Map<string, { product: string; category: string; sold: number; returned: number; net: number; cost: number }>();
  for (const l of lines) {
    const r = by.get(l.productId) ?? { product: l.name, category: l.category, sold: 0, returned: 0, net: 0, cost: 0 };
    r.sold += l.soldQty;
    r.returned += l.returnedQty;
    r.net += l.net;
    r.cost += l.cost;
    by.set(l.productId, r);
  }
  const rows = [...by.values()]
    .map((r) => ({
      product: r.product,
      category: r.category,
      sold: r.sold,
      returned: r.returned,
      netQty: r.sold - r.returned,
      net: money(r.net),
      cost: money(r.cost),
      profit: money(r.net - r.cost),
      margin: r.net ? money(((r.net - r.cost) / r.net) * 100) : null,
    }))
    .sort((a, b) => b.net - a.net);
  const net = rows.reduce((s, r) => s + r.net, 0);
  const cost = rows.reduce((s, r) => s + r.cost, 0);
  return {
    summary: [
      { label: "Products sold", value: rows.length, format: "int" },
      { label: "Net sales", value: money(net), format: "money" },
      { label: "Cost of goods", value: money(cost), format: "money" },
      { label: "Gross profit", value: money(net - cost), format: "money" },
      { label: "Margin", value: net ? money(((net - cost) / net) * 100) : 0, format: "pct" },
    ],
    columns: [
      { key: "product", label: "Product" },
      { key: "category", label: "Category" },
      { key: "sold", label: "Sold", format: "int", total: true },
      { key: "returned", label: "Returned", format: "int", total: true },
      { key: "netQty", label: "Net qty", format: "int", total: true },
      { key: "net", label: "Net sales", format: "money", total: true },
      { key: "cost", label: "Cost", format: "money", total: true },
      { key: "profit", label: "Gross profit", format: "money", total: true },
      { key: "margin", label: "Margin", format: "pct" },
    ],
    rows,
    note: "Net sales are each item's share of what its sale came to (after discounts and SC/PWD VAT exemption). Cost uses the cost saved at the time of sale (older sales use the product's current cost).",
  };
}

export async function salesByCategory(ctx: ReportContext): Promise<ReportResult> {
  const lines = await loadLines(ctx);
  const by = new Map<string, { units: number; net: number; cost: number; products: Set<string> }>();
  for (const l of lines) {
    const r = by.get(l.category) ?? { units: 0, net: 0, cost: 0, products: new Set<string>() };
    r.units += l.soldQty - l.returnedQty;
    r.net += l.net;
    r.cost += l.cost;
    r.products.add(l.productId);
    by.set(l.category, r);
  }
  const total = [...by.values()].reduce((s, r) => s + r.net, 0);
  const rows = [...by.entries()]
    .map(([category, r]) => ({
      category,
      products: r.products.size,
      units: r.units,
      net: money(r.net),
      cost: money(r.cost),
      profit: money(r.net - r.cost),
      margin: r.net ? money(((r.net - r.cost) / r.net) * 100) : null,
      share: total ? money((r.net / total) * 100) : null,
    }))
    .sort((a, b) => b.net - a.net);
  return {
    summary: [
      { label: "Categories", value: rows.length, format: "int" },
      { label: "Net sales", value: money(total), format: "money" },
      { label: "Top category", value: rows[0]?.category ?? "—" },
    ],
    columns: [
      { key: "category", label: "Category" },
      { key: "products", label: "Products", format: "int" },
      { key: "units", label: "Net qty", format: "int", total: true },
      { key: "net", label: "Net sales", format: "money", total: true },
      { key: "cost", label: "Cost", format: "money", total: true },
      { key: "profit", label: "Gross profit", format: "money", total: true },
      { key: "margin", label: "Margin", format: "pct" },
      { key: "share", label: "Share of sales", format: "pct" },
    ],
    rows,
  };
}

export async function salesByCashier(ctx: ReportContext): Promise<ReportResult> {
  const { sales, returns } = await loadSales(ctx);
  const voids = await prisma.sale.findMany({ where: saleWhere(ctx, "voids"), select: { userId: true, totalAmount: true } });
  const users = await prisma.user.findMany({ where: { tenantId: ctx.tenantId }, select: { id: true, firstName: true, lastName: true, role: true } });
  const nameOf = new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`.trim()]));
  const by = new Map<string, { transactions: number; net: number; discounts: number; returns: number; voids: number; voidAmount: number }>();
  const row = (id: string) => {
    let r = by.get(id);
    if (!r) by.set(id, (r = { transactions: 0, net: 0, discounts: 0, returns: 0, voids: 0, voidAmount: 0 }));
    return r;
  };
  for (const s of sales) {
    const r = row(s.userId);
    r.transactions++;
    r.net += n(s.totalAmount);
    r.discounts += n(s.discountAmount);
  }
  for (const s of returns) {
    const r = row(s.userId);
    r.returns += -n(s.totalAmount);
    r.net += n(s.totalAmount);
  }
  for (const v of voids) {
    const r = row(v.userId);
    r.voids++;
    r.voidAmount += n(v.totalAmount);
  }
  const total = [...by.values()].reduce((s, r) => s + r.net, 0);
  const rows = [...by.entries()]
    .map(([id, r]) => ({
      cashier: nameOf.get(id) ?? "Unknown",
      transactions: r.transactions,
      net: money(r.net),
      average: r.transactions ? money(r.net / r.transactions) : 0,
      discounts: money(r.discounts),
      returns: money(r.returns),
      voids: r.voids,
      voidAmount: money(r.voidAmount),
      share: total ? money((r.net / total) * 100) : null,
    }))
    .sort((a, b) => b.net - a.net);
  return {
    summary: [
      { label: "Cashiers", value: rows.length, format: "int" },
      { label: "Net sales", value: money(total), format: "money" },
      { label: "Voids", value: rows.reduce((s, r) => s + r.voids, 0), format: "int" },
    ],
    columns: [
      { key: "cashier", label: "Cashier" },
      { key: "transactions", label: "Trans.", format: "int", total: true },
      { key: "net", label: "Net sales", format: "money", total: true },
      { key: "average", label: "Avg sale", format: "money" },
      { key: "discounts", label: "Discounts given", format: "money", total: true },
      { key: "returns", label: "Returns", format: "money", total: true },
      { key: "voids", label: "Voids", format: "int", total: true },
      { key: "voidAmount", label: "Voided amount", format: "money", total: true },
      { key: "share", label: "Share", format: "pct" },
    ],
    rows,
    note: "Each sale counts for the user who rang it up; returns and voids for the user who processed them.",
  };
}

export async function salesByBranch(ctx: ReportContext): Promise<ReportResult> {
  const { sales, returns } = await loadSales(ctx);
  const items = await prisma.saleItem.findMany({
    where: { sale: { OR: [saleWhere(ctx, "sales"), saleWhere(ctx, "returns")] } },
    select: { quantity: true, unitCost: true, sale: { select: { storeId: true, originalSaleId: true } }, product: { select: { costPrice: true } } },
  });
  const by = new Map<string, { transactions: number; net: number; discounts: number; returns: number; cost: number }>();
  const row = (id: string) => {
    let r = by.get(id);
    if (!r) by.set(id, (r = { transactions: 0, net: 0, discounts: 0, returns: 0, cost: 0 }));
    return r;
  };
  for (const s of sales) {
    const r = row(s.storeId);
    r.transactions++;
    r.net += n(s.totalAmount);
    r.discounts += n(s.discountAmount);
  }
  for (const s of returns) {
    const r = row(s.storeId);
    r.returns += -n(s.totalAmount);
    r.net += n(s.totalAmount);
  }
  for (const i of items) row(i.sale.storeId).cost += n(i.unitCost ?? i.product.costPrice) * (i.sale.originalSaleId ? -i.quantity : i.quantity);
  const total = [...by.values()].reduce((s, r) => s + r.net, 0);
  const covered = ctx.storeIds ?? ctx.stores.map((s) => s.id);
  const rows = covered.map((id) => {
    const r = by.get(id) ?? { transactions: 0, net: 0, discounts: 0, returns: 0, cost: 0 };
    return {
      branch: storeName(ctx, id),
      transactions: r.transactions,
      net: money(r.net),
      average: r.transactions ? money(r.net / r.transactions) : 0,
      discounts: money(r.discounts),
      returns: money(r.returns),
      profit: money(r.net - r.cost),
      margin: r.net ? money(((r.net - r.cost) / r.net) * 100) : null,
      share: total ? money((r.net / total) * 100) : null,
    };
  });
  return {
    summary: [
      { label: "Branches", value: rows.length, format: "int" },
      { label: "Net sales", value: money(total), format: "money" },
      { label: "Top branch", value: [...rows].sort((a, b) => b.net - a.net)[0]?.branch ?? "—" },
    ],
    columns: [
      { key: "branch", label: "Branch" },
      { key: "transactions", label: "Trans.", format: "int", total: true },
      { key: "net", label: "Net sales", format: "money", total: true },
      { key: "average", label: "Avg sale", format: "money" },
      { key: "discounts", label: "Discounts", format: "money", total: true },
      { key: "returns", label: "Returns", format: "money", total: true },
      { key: "profit", label: "Gross profit", format: "money", total: true },
      { key: "margin", label: "Margin", format: "pct" },
      { key: "share", label: "Share", format: "pct" },
    ],
    rows,
  };
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export async function salesByHour(ctx: ReportContext): Promise<ReportResult> {
  const { sales, returns } = await loadSales(ctx);
  // Rows: hour of day; columns: each weekday's net sales, then totals.
  const grid = Array.from({ length: 24 }, () => ({ byDay: Array(7).fill(0) as number[], transactions: 0 }));
  for (const s of [...sales, ...returns]) {
    const h = grid[phHour(s.saleDate)];
    h.byDay[phWeekday(s.saleDate)] += n(s.totalAmount);
    if (!returns.includes(s)) h.transactions++;
  }
  const total = grid.reduce((s, h) => s + h.byDay.reduce((a, b) => a + b, 0), 0);
  const rows = grid
    .map((h, hour) => {
      const net = h.byDay.reduce((a, b) => a + b, 0);
      const label = `${hour % 12 || 12}:00 ${hour < 12 ? "AM" : "PM"}`;
      return {
        hour: label,
        ...Object.fromEntries(WEEKDAYS.map((d, i) => [d.slice(0, 3).toLowerCase(), money(h.byDay[i])])),
        transactions: h.transactions,
        net: money(net),
        share: total ? money((net / total) * 100) : null,
      };
    })
    .filter((r) => r.transactions > 0 || r.net !== 0);
  const peak = [...rows].sort((a, b) => b.net - a.net)[0];
  const dayTotals = WEEKDAYS.map((d, i) => ({ d, v: grid.reduce((s, h) => s + h.byDay[i], 0) })).sort((a, b) => b.v - a.v);
  return {
    summary: [
      { label: "Busiest hour", value: peak?.hour ?? "—" },
      { label: "Busiest day", value: dayTotals[0]?.v ? dayTotals[0].d : "—" },
      { label: "Net sales", value: money(total), format: "money" },
    ],
    columns: [
      { key: "hour", label: "Hour" },
      ...WEEKDAYS.map((d) => ({ key: d.slice(0, 3).toLowerCase(), label: d.slice(0, 3), format: "money" as const, total: true })),
      { key: "transactions", label: "Trans.", format: "int", total: true },
      { key: "net", label: "Net sales", format: "money", total: true },
      { key: "share", label: "Share", format: "pct" },
    ],
    rows,
  };
}

export async function paymentMethods(ctx: ReportContext): Promise<ReportResult> {
  const { sales, returns } = await loadSales(ctx);
  const refs = await prisma.sale.count({ where: { ...saleWhere(ctx, "sales"), paymentReference: { not: null } } });
  const by = new Map<string, { method: string; provider: string; transactions: number; amount: number; refunds: number }>();
  for (const s of [...sales, ...returns]) {
    const provider = s.paymentMethod === "E_WALLET" ? s.paymentProvider ?? "Unspecified" : "—";
    const key = `${s.paymentMethod}|${provider}`;
    const r = by.get(key) ?? { method: paymentMethodLabel(s.paymentMethod), provider, transactions: 0, amount: 0, refunds: 0 };
    if (returns.includes(s)) r.refunds += -n(s.totalAmount);
    else r.transactions++;
    r.amount += n(s.totalAmount);
    by.set(key, r);
  }
  const total = [...by.values()].reduce((s, r) => s + r.amount, 0);
  const rows = [...by.values()]
    .map((r) => ({ ...r, amount: money(r.amount), refunds: money(r.refunds), average: r.transactions ? money(r.amount / r.transactions) : 0, share: total ? money((r.amount / total) * 100) : null }))
    .sort((a, b) => b.amount - a.amount);
  const ewallet = rows.filter((r) => r.method === "E-wallet").reduce((s, r) => s + r.amount, 0);
  return {
    summary: [
      { label: "Net collected", value: money(total), format: "money" },
      { label: "E-wallet", value: money(ewallet), format: "money" },
      { label: "E-wallet share", value: total ? money((ewallet / total) * 100) : 0, format: "pct" },
      { label: "With reference no.", value: refs, format: "int" },
    ],
    columns: [
      { key: "method", label: "Method" },
      { key: "provider", label: "Provider" },
      { key: "transactions", label: "Trans.", format: "int", total: true },
      { key: "amount", label: "Net amount", format: "money", total: true },
      { key: "refunds", label: "Refunded", format: "money", total: true },
      { key: "average", label: "Avg sale", format: "money" },
      { key: "share", label: "Share", format: "pct" },
    ],
    rows,
    note: "Match each e-wallet provider's total against the store's wallet statement for the same dates.",
  };
}

export async function voidsReturns(ctx: ReportContext): Promise<ReportResult> {
  const rows = await prisma.sale.findMany({
    where: { OR: [saleWhere(ctx, "voids"), saleWhere(ctx, "returns")] },
    select: {
      saleNumber: true,
      saleDate: true,
      status: true,
      totalAmount: true,
      orderRemarks: true,
      storeId: true,
      user: { select: { firstName: true, lastName: true } },
      originalSale: { select: { saleNumber: true } },
      items: { select: { quantity: true } },
    },
    orderBy: { saleDate: "desc" },
    take: 5000,
  });
  const out = rows.map((r) => ({
    date: r.saleDate.toISOString(),
    type: r.status === "CANCELLED" ? "Void" : "Return",
    number: r.saleNumber,
    original: r.originalSale?.saleNumber ?? (r.status === "CANCELLED" ? r.saleNumber : "—"),
    branch: storeName(ctx, r.storeId),
    by: `${r.user.firstName} ${r.user.lastName}`.trim(),
    items: r.items.reduce((s, i) => s + i.quantity, 0),
    amount: money(Math.abs(n(r.totalAmount))),
    reason: r.status === "CANCELLED" ? r.orderRemarks ?? "" : (r.orderRemarks ?? "").replace(/^Return for [^:]*:?\s*/, ""),
  }));
  const voids = out.filter((r) => r.type === "Void");
  const rets = out.filter((r) => r.type === "Return");
  return {
    summary: [
      { label: "Voids", value: voids.length, format: "int" },
      { label: "Voided amount", value: money(voids.reduce((s, r) => s + r.amount, 0)), format: "money" },
      { label: "Returns", value: rets.length, format: "int" },
      { label: "Refunded", value: money(rets.reduce((s, r) => s + r.amount, 0)), format: "money" },
    ],
    columns: [
      { key: "date", label: "Date", format: "datetime" },
      { key: "type", label: "Type" },
      { key: "number", label: "Number" },
      { key: "original", label: "Original sale" },
      ...(ctx.storeIds?.length === 1 ? [] : [{ key: "branch", label: "Branch" }]),
      { key: "by", label: "Processed by" },
      { key: "items", label: "Items", format: "int", total: true },
      { key: "amount", label: "Amount", format: "money", total: true },
      { key: "reason", label: "Reason" },
    ],
    rows: out,
  };
}
