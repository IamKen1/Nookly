import { prisma } from "@/lib/prisma";
import { supplierBalances } from "@/lib/payables";
import type { ReportResult } from "./registry";
import { type ReportContext, money, storeName, storeWhere } from "./context";

const n = (v: unknown) => Number(v ?? 0);
const multi = (ctx: ReportContext) => ctx.storeIds?.length !== 1;
const person = (u: { firstName: string; lastName: string } | null) => (u ? `${u.firstName} ${u.lastName}`.trim() : "");

export async function purchasesBySupplier(ctx: ReportContext): Promise<ReportResult> {
  const [deliveries, returns] = await Promise.all([
    prisma.receiving.findMany({
      where: { tenantId: ctx.tenantId, ...storeWhere(ctx), receivedAt: { gte: ctx.from, lt: ctx.to } },
      select: { supplierId: true, receivedAt: true, totalCost: true, supplier: { select: { name: true } }, items: { select: { quantity: true } } },
    }),
    prisma.supplierReturn.findMany({
      where: { tenantId: ctx.tenantId, ...storeWhere(ctx), returnedAt: { gte: ctx.from, lt: ctx.to } },
      select: { supplierId: true, totalCost: true, supplier: { select: { name: true } } },
    }),
  ]);
  type Row = { supplier: string; deliveries: number; lines: number; units: number; purchases: number; returns: number; last: Date | null };
  const by = new Map<string, Row>();
  const row = (id: string | null, name: string) => {
    const key = id ?? "none";
    let r = by.get(key);
    if (!r) by.set(key, (r = { supplier: name, deliveries: 0, lines: 0, units: 0, purchases: 0, returns: 0, last: null }));
    return r;
  };
  for (const d of deliveries) {
    const r = row(d.supplierId, d.supplier?.name ?? "No supplier recorded");
    r.deliveries++;
    r.lines += d.items.length;
    r.units += d.items.reduce((s, i) => s + i.quantity, 0);
    r.purchases += n(d.totalCost);
    if (!r.last || d.receivedAt > r.last) r.last = d.receivedAt;
  }
  for (const rt of returns) row(rt.supplierId, rt.supplier.name).returns += n(rt.totalCost);
  const net = [...by.values()].reduce((s, r) => s + r.purchases - r.returns, 0);
  const rows = [...by.values()]
    .map((r) => ({
      supplier: r.supplier,
      deliveries: r.deliveries,
      lines: r.lines,
      units: r.units,
      purchases: money(r.purchases),
      returns: money(r.returns),
      net: money(r.purchases - r.returns),
      share: net ? money(((r.purchases - r.returns) / net) * 100) : null,
      last: r.last?.toISOString() ?? null,
    }))
    .sort((a, b) => b.net - a.net);
  return {
    summary: [
      { label: "Suppliers", value: rows.length, format: "int" },
      { label: "Deliveries", value: deliveries.length, format: "int" },
      { label: "Net purchases", value: money(net), format: "money" },
      { label: "Returned to suppliers", value: money(rows.reduce((s, r) => s + r.returns, 0)), format: "money" },
    ],
    columns: [
      { key: "supplier", label: "Supplier" },
      { key: "deliveries", label: "Deliveries", format: "int", total: true },
      { key: "lines", label: "Lines", format: "int", total: true },
      { key: "units", label: "Units", format: "int", total: true },
      { key: "purchases", label: "Purchases", format: "money", total: true },
      { key: "returns", label: "Returns", format: "money", total: true },
      { key: "net", label: "Net purchases", format: "money", total: true },
      { key: "share", label: "Share", format: "pct" },
      { key: "last", label: "Last delivery", format: "date" },
    ],
    rows,
  };
}

export async function purchaseLog(ctx: ReportContext): Promise<ReportResult> {
  const items = await prisma.receivingItem.findMany({
    where: { receiving: { tenantId: ctx.tenantId, ...storeWhere(ctx), receivedAt: { gte: ctx.from, lt: ctx.to } } },
    select: {
      batchNumber: true,
      expirationDate: true,
      quantity: true,
      unitCost: true,
      product: { select: { name: true } },
      receiving: {
        select: { receivedAt: true, receivingNumber: true, referenceNumber: true, storeId: true, supplier: { select: { name: true } }, receivedBy: { select: { firstName: true, lastName: true } } },
      },
    },
    orderBy: [{ receiving: { receivedAt: "desc" } }, { id: "asc" }],
    take: 10000,
  });
  const rows = items.map((i) => ({
    date: i.receiving.receivedAt.toISOString(),
    number: i.receiving.receivingNumber,
    dr: i.receiving.referenceNumber ?? "",
    supplier: i.receiving.supplier?.name ?? "",
    branch: storeName(ctx, i.receiving.storeId),
    product: i.product.name,
    batch: i.batchNumber,
    expiry: i.expirationDate.toISOString(),
    quantity: i.quantity,
    unitCost: money(n(i.unitCost)),
    amount: money(i.quantity * n(i.unitCost)),
    by: person(i.receiving.receivedBy),
  }));
  return {
    summary: [
      { label: "Deliveries", value: new Set(rows.map((r) => r.number)).size, format: "int" },
      { label: "Lines", value: rows.length, format: "int" },
      { label: "Units", value: rows.reduce((s, r) => s + r.quantity, 0), format: "int" },
      { label: "Amount", value: money(rows.reduce((s, r) => s + r.amount, 0)), format: "money" },
    ],
    columns: [
      { key: "date", label: "Received", format: "date" },
      { key: "number", label: "RCV #" },
      { key: "dr", label: "DR / Invoice #" },
      { key: "supplier", label: "Supplier" },
      ...(multi(ctx) ? [{ key: "branch", label: "Branch" }] : []),
      { key: "product", label: "Product" },
      { key: "batch", label: "Batch" },
      { key: "expiry", label: "Expiry", format: "date" },
      { key: "quantity", label: "Qty", format: "int", total: true },
      { key: "unitCost", label: "Unit cost", format: "money" },
      { key: "amount", label: "Amount", format: "money", total: true },
      { key: "by", label: "Received by" },
    ],
    rows,
  };
}

export async function payablesAging(ctx: ReportContext): Promise<ReportResult> {
  const [balances, suppliers] = await Promise.all([
    supplierBalances(ctx.tenantId),
    prisma.supplier.findMany({ where: { tenantId: ctx.tenantId }, select: { id: true, name: true, paymentTermsDays: true } }),
  ]);
  const rows = suppliers
    .map((s) => {
      const b = balances.get(s.id);
      return {
        supplier: s.name,
        terms: s.paymentTermsDays === 0 ? "COD" : `${s.paymentTermsDays} days`,
        current: b?.aging.current ?? 0,
        d1_30: b?.aging.d1_30 ?? 0,
        d31_60: b?.aging.d31_60 ?? 0,
        d61_90: b?.aging.d61_90 ?? 0,
        d90: b?.aging.d90 ?? 0,
        open: b?.open ?? 0,
        credit: b?.credit ?? 0,
        balance: b?.balance ?? 0,
      };
    })
    .filter((r) => r.open !== 0 || r.credit !== 0)
    .sort((a, b) => b.balance - a.balance);
  const sum = (k: keyof (typeof rows)[number]) => money(rows.reduce((s, r) => s + Number(r[k]), 0));
  return {
    summary: [
      { label: "Total payable", value: sum("balance"), format: "money" },
      { label: "Overdue", value: money(sum("d1_30") + sum("d31_60") + sum("d61_90") + sum("d90")), format: "money" },
      { label: "Over 60 days", value: money(sum("d61_90") + sum("d90")), format: "money" },
      { label: "Credit on file", value: sum("credit"), format: "money" },
    ],
    columns: [
      { key: "supplier", label: "Supplier" },
      { key: "terms", label: "Terms" },
      { key: "current", label: "Not yet due", format: "money", total: true },
      { key: "d1_30", label: "1–30 days", format: "money", total: true },
      { key: "d31_60", label: "31–60 days", format: "money", total: true },
      { key: "d61_90", label: "61–90 days", format: "money", total: true },
      { key: "d90", label: "Over 90", format: "money", total: true },
      { key: "open", label: "Unpaid", format: "money", total: true },
      { key: "credit", label: "Credit", format: "money", total: true },
      { key: "balance", label: "Balance", format: "money", total: true },
    ],
    rows,
    note: "As of now, all branches (suppliers are paid by the business). Days are counted past each delivery's due date.",
  };
}

const REASONS: Record<string, string> = { EXPIRED: "Expired", NEAR_EXPIRY: "Near expiry", DAMAGED: "Damaged", WRONG_ITEM: "Wrong item", OTHER: "Other" };
const SETTLEMENTS: Record<string, string> = { CREDIT: "Credit", REPLACEMENT: "Replacement", REFUND: "Refund" };

export async function supplierReturns(ctx: ReportContext): Promise<ReportResult> {
  const items = await prisma.supplierReturnItem.findMany({
    where: { supplierReturn: { tenantId: ctx.tenantId, ...storeWhere(ctx), returnedAt: { gte: ctx.from, lt: ctx.to } } },
    select: {
      batchNumber: true,
      quantity: true,
      unitCost: true,
      product: { select: { name: true } },
      supplierReturn: {
        select: { returnedAt: true, returnNumber: true, referenceNumber: true, reason: true, settlement: true, storeId: true, supplier: { select: { name: true } }, createdBy: { select: { firstName: true, lastName: true } } },
      },
    },
    orderBy: { supplierReturn: { returnedAt: "desc" } },
    take: 10000,
  });
  const rows = items.map((i) => ({
    date: i.supplierReturn.returnedAt.toISOString(),
    number: i.supplierReturn.returnNumber,
    supplier: i.supplierReturn.supplier.name,
    branch: storeName(ctx, i.supplierReturn.storeId),
    product: i.product.name,
    batch: i.batchNumber,
    quantity: i.quantity,
    amount: money(i.quantity * n(i.unitCost)),
    reason: REASONS[i.supplierReturn.reason] ?? i.supplierReturn.reason,
    settlement: SETTLEMENTS[i.supplierReturn.settlement] ?? i.supplierReturn.settlement,
    memo: i.supplierReturn.referenceNumber ?? "",
    by: person(i.supplierReturn.createdBy),
  }));
  return {
    summary: [
      { label: "Returns", value: new Set(rows.map((r) => r.number)).size, format: "int" },
      { label: "Units", value: rows.reduce((s, r) => s + r.quantity, 0), format: "int" },
      { label: "Value at cost", value: money(rows.reduce((s, r) => s + r.amount, 0)), format: "money" },
      { label: "Credited", value: money(rows.filter((r) => r.settlement === "Credit").reduce((s, r) => s + r.amount, 0)), format: "money" },
    ],
    columns: [
      { key: "date", label: "Date", format: "date" },
      { key: "number", label: "RTS #" },
      { key: "supplier", label: "Supplier" },
      ...(multi(ctx) ? [{ key: "branch", label: "Branch" }] : []),
      { key: "product", label: "Product" },
      { key: "batch", label: "Batch" },
      { key: "quantity", label: "Qty", format: "int", total: true },
      { key: "amount", label: "Value at cost", format: "money", total: true },
      { key: "reason", label: "Reason" },
      { key: "settlement", label: "Settlement" },
      { key: "memo", label: "Credit memo #" },
      { key: "by", label: "By" },
    ],
    rows,
  };
}

export async function shiftSummary(ctx: ReportContext): Promise<ReportResult> {
  const shifts = await prisma.shift.findMany({
    where: { tenantId: ctx.tenantId, ...storeWhere(ctx), openedAt: { gte: ctx.from, lt: ctx.to } },
    select: {
      id: true,
      openedAt: true,
      closedAt: true,
      storeId: true,
      startingCash: true,
      expectedCash: true,
      endingCash: true,
      user: { select: { firstName: true, lastName: true } },
      expenses: { select: { amount: true } },
    },
    orderBy: { openedAt: "desc" },
    take: 5000,
  });
  const ids = shifts.map((s) => s.id);
  const [sales, cash] = await Promise.all([
    prisma.sale.groupBy({ by: ["shiftId", "paymentMethod"], where: { shiftId: { in: ids }, status: { not: "CANCELLED" } }, _sum: { totalAmount: true }, _count: true }),
    prisma.cashTransaction.groupBy({ by: ["shiftId", "type"], where: { shiftId: { in: ids } }, _sum: { amount: true, serviceFee: true } }),
  ]);
  const rows = shifts.map((s) => {
    const mine = sales.filter((x) => x.shiftId === s.id);
    const net = mine.reduce((t, x) => t + n(x._sum.totalAmount), 0);
    const cashSales = mine.filter((x) => x.paymentMethod === "CASH").reduce((t, x) => t + n(x._sum.totalAmount), 0);
    const tx = cash.filter((x) => x.shiftId === s.id);
    const cashIn = tx.filter((x) => x.type !== "CASH_OUT").reduce((t, x) => t + n(x._sum.amount) + n(x._sum.serviceFee), 0);
    const cashOut = tx.filter((x) => x.type === "CASH_OUT").reduce((t, x) => t + n(x._sum.amount) - n(x._sum.serviceFee), 0);
    const expected = s.expectedCash != null ? n(s.expectedCash) : null;
    const counted = s.endingCash != null ? n(s.endingCash) : null;
    return {
      opened: s.openedAt.toISOString(),
      closed: s.closedAt?.toISOString() ?? null,
      cashier: person(s.user),
      branch: storeName(ctx, s.storeId),
      transactions: mine.reduce((t, x) => t + x._count, 0),
      net: money(net),
      starting: money(n(s.startingCash)),
      cashSales: money(cashSales),
      eservices: money(cashIn - cashOut),
      expenses: money(s.expenses.reduce((t, e) => t + n(e.amount), 0)),
      expected: expected === null ? null : money(expected),
      counted: counted === null ? null : money(counted),
      variance: expected !== null && counted !== null ? money(counted - expected) : null,
      status: s.closedAt ? "" : "Open",
    };
  });
  const closed = rows.filter((r) => r.variance !== null);
  return {
    summary: [
      { label: "Shifts", value: rows.length, format: "int" },
      { label: "Net over/short", value: money(closed.reduce((s, r) => s + (r.variance ?? 0), 0)), format: "money" },
      { label: "Shifts short", value: closed.filter((r) => (r.variance ?? 0) < 0).length, format: "int" },
      { label: "Still open", value: rows.filter((r) => r.status === "Open").length, format: "int" },
    ],
    columns: [
      { key: "opened", label: "Opened", format: "datetime" },
      { key: "closed", label: "Closed", format: "datetime" },
      { key: "cashier", label: "Cashier" },
      ...(multi(ctx) ? [{ key: "branch", label: "Branch" }] : []),
      { key: "transactions", label: "Trans.", format: "int", total: true },
      { key: "net", label: "Net sales", format: "money", total: true },
      { key: "starting", label: "Starting cash", format: "money" },
      { key: "cashSales", label: "Cash sales", format: "money", total: true },
      { key: "eservices", label: "E-services cash", format: "money", total: true },
      { key: "expenses", label: "Expenses", format: "money", total: true },
      { key: "expected", label: "Expected", format: "money" },
      { key: "counted", label: "Counted", format: "money" },
      { key: "variance", label: "Over / short", format: "money", total: true },
      { key: "status", label: "" },
    ],
    rows,
    note: "Over / short = cash counted at close − expected cash. Negative means the drawer was short.",
  };
}

const ESERVICE_TYPES: Record<string, string> = { CASH_IN: "Cash-in", CASH_OUT: "Cash-out", LOAD: "Load" };

export async function eServices(ctx: ReportContext): Promise<ReportResult> {
  const tx = await prisma.cashTransaction.findMany({
    where: { tenantId: ctx.tenantId, ...storeWhere(ctx), createdAt: { gte: ctx.from, lt: ctx.to } },
    select: { createdAt: true, type: true, provider: true, amount: true, serviceFee: true, referenceNumber: true, customerName: true, storeId: true, user: { select: { firstName: true, lastName: true } } },
    orderBy: { createdAt: "desc" },
    take: 10000,
  });
  const rows = tx.map((t) => ({
    date: t.createdAt.toISOString(),
    type: ESERVICE_TYPES[t.type] ?? t.type,
    provider: t.provider,
    amount: money(n(t.amount)),
    fee: money(n(t.serviceFee)),
    reference: t.referenceNumber ?? "",
    customer: t.customerName ?? "",
    branch: storeName(ctx, t.storeId),
    by: person(t.user),
  }));
  const sum = (type: string) => money(rows.filter((r) => r.type === type).reduce((s, r) => s + r.amount, 0));
  return {
    summary: [
      { label: "Transactions", value: rows.length, format: "int" },
      { label: "Cash-in", value: sum("Cash-in"), format: "money" },
      { label: "Cash-out", value: sum("Cash-out"), format: "money" },
      { label: "Load", value: sum("Load"), format: "money" },
      { label: "Fees earned", value: money(rows.reduce((s, r) => s + r.fee, 0)), format: "money" },
    ],
    columns: [
      { key: "date", label: "Date", format: "datetime" },
      { key: "type", label: "Type" },
      { key: "provider", label: "Provider" },
      { key: "amount", label: "Amount", format: "money", total: true },
      { key: "fee", label: "Fee", format: "money", total: true },
      { key: "reference", label: "Reference" },
      { key: "customer", label: "Customer" },
      ...(multi(ctx) ? [{ key: "branch", label: "Branch" }] : []),
      { key: "by", label: "By" },
    ],
    rows,
  };
}

const RX_STATUS: Record<string, string> = { FILLED: "Fully served", PARTIAL: "Partially served", PENDING: "Not yet served", CANCELLED: "Cancelled", EXPIRED: "Expired" };

export async function prescriptionsReport(ctx: ReportContext): Promise<ReportResult> {
  const rx = await prisma.prescription.findMany({
    where: { tenantId: ctx.tenantId, createdAt: { gte: ctx.from, lt: ctx.to } },
    select: {
      prescriptionNumber: true,
      originalDate: true,
      createdAt: true,
      status: true,
      customer: { select: { firstName: true, lastName: true } },
      doctor: { select: { firstName: true, lastName: true, licenseNumber: true } },
      items: { select: { quantity: true, servedQuantity: true, product: { select: { name: true } } } },
    },
    orderBy: { createdAt: "desc" },
    take: 10000,
  });
  const rows = rx.map((r) => ({
    number: r.prescriptionNumber,
    date: r.originalDate.toISOString(),
    customer: person(r.customer),
    doctor: `Dr. ${person(r.doctor)}`,
    license: r.doctor.licenseNumber ?? "",
    items: r.items.map((i) => i.product.name).join(", "),
    prescribed: r.items.reduce((s, i) => s + i.quantity, 0),
    served: r.items.reduce((s, i) => s + i.servedQuantity, 0),
    status: RX_STATUS[r.status] ?? r.status,
  }));
  return {
    summary: [
      { label: "Prescriptions", value: rows.length, format: "int" },
      { label: "Fully served", value: rows.filter((r) => r.status === "Fully served").length, format: "int" },
      { label: "Partially served", value: rows.filter((r) => r.status === "Partially served").length, format: "int" },
      { label: "Doctors", value: new Set(rows.map((r) => r.doctor)).size, format: "int" },
    ],
    columns: [
      { key: "number", label: "Rx #" },
      { key: "date", label: "Date", format: "date" },
      { key: "customer", label: "Customer" },
      { key: "doctor", label: "Doctor" },
      { key: "license", label: "License #" },
      { key: "items", label: "Items" },
      { key: "prescribed", label: "Prescribed", format: "int", total: true },
      { key: "served", label: "Served", format: "int", total: true },
      { key: "status", label: "Status" },
    ],
    rows,
    note: "Prescriptions recorded in the period (all branches).",
  };
}
