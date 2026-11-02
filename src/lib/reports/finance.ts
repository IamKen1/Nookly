import { prisma } from "@/lib/prisma";
import type { ReportResult } from "./registry";
import { type ReportContext, DAY_MS, daysIn, money, phDay, saleWhere, storeName, storeWhere } from "./context";
import { startOfDatePH } from "@/lib/timezone";

const n = (v: unknown) => Number(v ?? 0);

export async function vatSummary(ctx: ReportContext): Promise<ReportResult> {
  const select = { saleDate: true, totalAmount: true, taxAmount: true, vatableSales: true, nonVatableSales: true, discountAmount: true, discountVatExempt: true } as const;
  const [sales, returns] = await Promise.all([
    prisma.sale.findMany({ where: saleWhere(ctx, "sales"), select }),
    prisma.sale.findMany({ where: saleWhere(ctx, "returns"), select }),
  ]);
  const days = new Map(daysIn(ctx).map((d) => [d, { date: d, transactions: 0, vatable: 0, vat: 0, exempt: 0, nonVat: 0, scPwdDiscount: 0, total: 0 }]));
  for (const s of sales) {
    const r = days.get(phDay(s.saleDate));
    if (!r) continue;
    r.transactions++;
    r.total += n(s.totalAmount);
    r.vat += n(s.taxAmount);
    r.nonVat += n(s.nonVatableSales);
    // SC/PWD sales: the VATable part is sold VAT-exempt.
    if (s.discountVatExempt) {
      r.exempt += n(s.vatableSales);
      r.scPwdDiscount += n(s.discountAmount);
    } else r.vatable += n(s.vatableSales);
  }
  for (const s of returns) {
    const r = days.get(phDay(s.saleDate));
    if (!r) continue;
    // Returns keep only totals; their VATable base is backed out of the VAT.
    const vat = n(s.taxAmount);
    const vatableBase = vat ? vat / 0.12 : 0;
    r.total += n(s.totalAmount);
    r.vat += vat;
    r.vatable += vatableBase;
    r.nonVat += n(s.totalAmount) - vatableBase - vat;
  }
  const rows = [...days.values()].map((r) => ({
    date: r.date,
    transactions: r.transactions,
    vatable: money(r.vatable),
    vat: money(r.vat),
    exempt: money(r.exempt),
    nonVat: money(r.nonVat),
    total: money(r.total),
    scPwdDiscount: money(r.scPwdDiscount),
  }));
  const sum = (k: "vatable" | "vat" | "exempt" | "nonVat" | "total") => money(rows.reduce((s, r) => s + r[k], 0));
  return {
    summary: [
      { label: "VATable sales", value: sum("vatable"), format: "money" },
      { label: "Output VAT (12%)", value: sum("vat"), format: "money" },
      { label: "VAT-exempt sales", value: sum("exempt"), format: "money" },
      { label: "Non-VAT sales", value: sum("nonVat"), format: "money" },
    ],
    columns: [
      { key: "date", label: "Date", format: "date" },
      { key: "transactions", label: "Trans.", format: "int", total: true },
      { key: "vatable", label: "VATable sales", format: "money", total: true },
      { key: "vat", label: "Output VAT", format: "money", total: true },
      { key: "exempt", label: "VAT-exempt sales", format: "money", total: true },
      { key: "nonVat", label: "Non-VAT sales", format: "money", total: true },
      { key: "scPwdDiscount", label: "SC/PWD discount", format: "money", total: true },
      { key: "total", label: "Total sales", format: "money", total: true },
    ],
    rows,
    note: "VATable sales are net of VAT. VAT-exempt sales are SC/PWD (and other VAT-exempt discount) sales. Returns are netted out on the day they were made. Nookly receipts are not BIR-accredited invoices — use this as a working summary for your accountant.",
  };
}

export async function discountListing(ctx: ReportContext): Promise<ReportResult> {
  const sales = await prisma.sale.findMany({
    where: { ...saleWhere(ctx, "sales"), discountAmount: { gt: 0 } },
    select: {
      saleNumber: true,
      saleDate: true,
      storeId: true,
      discountType: true,
      discountName: true,
      discountHolderName: true,
      discountIdNumber: true,
      discountVatExempt: true,
      subtotal: true,
      vatRemovedFromVatable: true,
      discountAmount: true,
      totalAmount: true,
      status: true,
      user: { select: { firstName: true, lastName: true } },
    },
    orderBy: { saleDate: "asc" },
    take: 10000,
  });
  const LABEL: Record<string, string> = { SENIOR: "Senior citizen", PWD: "PWD", STUDENT: "Student", EMPLOYEE: "Employee" };
  const rows = sales.map((s) => ({
    date: s.saleDate.toISOString(),
    number: s.saleNumber,
    discount: s.discountName ?? LABEL[s.discountType ?? ""] ?? s.discountType ?? "Discount",
    holder: s.discountHolderName ?? "",
    idNumber: s.discountIdNumber ?? "",
    gross: money(n(s.subtotal)),
    vatExempt: money(n(s.vatRemovedFromVatable)),
    amount: money(n(s.discountAmount)),
    net: money(n(s.totalAmount)),
    status: s.status === "RETURNED" ? "Returned" : "",
    branch: storeName(ctx, s.storeId),
    cashier: `${s.user.firstName} ${s.user.lastName}`.trim(),
  }));
  const scPwd = sales.filter((s) => s.discountType === "SENIOR" || s.discountType === "PWD");
  const missingId = scPwd.filter((s) => !s.discountIdNumber?.trim()).length;
  return {
    summary: [
      { label: "Discounted sales", value: rows.length, format: "int" },
      { label: "Total discount", value: money(rows.reduce((s, r) => s + r.amount, 0)), format: "money" },
      { label: "VAT exempted", value: money(rows.reduce((s, r) => s + r.vatExempt, 0)), format: "money" },
      { label: "SC/PWD without ID no.", value: missingId, format: "int" },
    ],
    columns: [
      { key: "date", label: "Date", format: "datetime" },
      { key: "number", label: "AR #" },
      { key: "discount", label: "Discount" },
      { key: "holder", label: "Name of holder" },
      { key: "idNumber", label: "OSCA / PWD / ID no." },
      { key: "gross", label: "Gross amount", format: "money", total: true },
      { key: "vatExempt", label: "VAT exempt", format: "money", total: true },
      { key: "amount", label: "Discount", format: "money", total: true },
      { key: "net", label: "Net amount", format: "money", total: true },
      ...(ctx.storeIds?.length === 1 ? [] : [{ key: "branch", label: "Branch" }]),
      { key: "cashier", label: "Cashier" },
      { key: "status", label: "Note" },
    ],
    rows,
    note: "One row per discounted sale, oldest first. Sales later returned are marked; their refunds appear in Voids & returns.",
  };
}

// The figures behind the profit & loss for one period.
async function pnl(ctx: ReportContext) {
  const [sales, returns, items, expenses, eservices] = await Promise.all([
    prisma.sale.aggregate({ where: saleWhere(ctx, "sales"), _sum: { subtotal: true, discountAmount: true, vatRemovedFromVatable: true, totalAmount: true, taxAmount: true } }),
    prisma.sale.aggregate({ where: saleWhere(ctx, "returns"), _sum: { totalAmount: true, taxAmount: true } }),
    prisma.saleItem.findMany({
      where: { sale: { OR: [saleWhere(ctx, "sales"), saleWhere(ctx, "returns")] } },
      select: { quantity: true, unitCost: true, sale: { select: { originalSaleId: true } }, product: { select: { costPrice: true } } },
    }),
    prisma.shiftExpense.findMany({
      where: { tenantId: ctx.tenantId, createdAt: { gte: ctx.from, lt: ctx.to }, shift: storeWhere(ctx) },
      select: { description: true, amount: true },
    }),
    prisma.cashTransaction.aggregate({ where: { tenantId: ctx.tenantId, ...storeWhere(ctx), createdAt: { gte: ctx.from, lt: ctx.to } }, _sum: { serviceFee: true } }),
  ]);
  const cogs = items.reduce((s, i) => s + n(i.unitCost ?? i.product.costPrice) * (i.sale.originalSaleId ? -i.quantity : i.quantity), 0);
  const byExpense = new Map<string, number>();
  for (const e of expenses) {
    const key = e.description.trim().replace(/\s+/g, " ").toLowerCase();
    byExpense.set(key, (byExpense.get(key) ?? 0) + n(e.amount));
  }
  const gross = n(sales._sum.subtotal);
  const discounts = n(sales._sum.discountAmount);
  const vatExempt = n(sales._sum.vatRemovedFromVatable);
  const returnsAmt = -n(returns._sum.totalAmount);
  const net = n(sales._sum.totalAmount) + n(returns._sum.totalAmount);
  const vat = n(sales._sum.taxAmount) + n(returns._sum.taxAmount);
  const netOfVat = net - vat;
  const expenseTotal = expenses.reduce((s, e) => s + n(e.amount), 0);
  const fees = n(eservices._sum.serviceFee);
  return { gross, discounts, vatExempt, returnsAmt, net, vat, netOfVat, cogs, expenseTotal, byExpense, fees };
}

export async function profitLoss(ctx: ReportContext): Promise<ReportResult> {
  const days = Math.round((ctx.to.getTime() - startOfDatePH(ctx.fromKey).getTime()) / DAY_MS);
  const prevTo = startOfDatePH(ctx.fromKey);
  const prevFrom = new Date(prevTo.getTime() - days * DAY_MS);
  const prevCtx = { ...ctx, from: prevFrom, to: prevTo, fromKey: phDay(prevFrom), toKey: phDay(new Date(prevTo.getTime() - 1)) };
  const [cur, prev] = await Promise.all([pnl(ctx), pnl(prevCtx)]);

  const line = (label: string, a: number, b: number, kind: "item" | "subtotal" | "total" = "item") => ({
    line: label,
    amount: money(a),
    pct: cur.netOfVat ? money((a / cur.netOfVat) * 100) : null,
    previous: money(b),
    change: b ? money(((a - b) / Math.abs(b)) * 100) : null,
    kind,
  });
  const gp = (x: typeof cur) => x.netOfVat - x.cogs;
  const ni = (x: typeof cur) => gp(x) - x.expenseTotal + x.fees;
  const expenseLines = [...cur.byExpense.entries()].sort((a, b) => b[1] - a[1]);
  const rows = [
    line("Gross sales", cur.gross, prev.gross),
    line("Less: discounts", -cur.discounts, -prev.discounts),
    line("Less: VAT exemption (SC/PWD)", -cur.vatExempt, -prev.vatExempt),
    line("Less: returns", -cur.returnsAmt, -prev.returnsAmt),
    line("Net sales (VAT-inclusive)", cur.net, prev.net, "subtotal"),
    line("Less: output VAT", -cur.vat, -prev.vat),
    line("Net sales (net of VAT)", cur.netOfVat, prev.netOfVat, "subtotal"),
    line("Cost of goods sold", -cur.cogs, -prev.cogs),
    line("Gross profit", gp(cur), gp(prev), "subtotal"),
    ...expenseLines.map(([k, v]) => line(`Expense: ${k.charAt(0).toUpperCase()}${k.slice(1)}`, -v, -(prev.byExpense.get(k) ?? 0))),
    line("Total expenses", -cur.expenseTotal, -prev.expenseTotal, "subtotal"),
    line("E-services fee income", cur.fees, prev.fees),
    line("Net income", ni(cur), ni(prev), "total"),
  ];
  return {
    summary: [
      { label: "Net sales (net of VAT)", value: money(cur.netOfVat), format: "money" },
      { label: "Gross profit", value: money(gp(cur)), format: "money" },
      { label: "Gross margin", value: cur.netOfVat ? money((gp(cur) / cur.netOfVat) * 100) : 0, format: "pct" },
      { label: "Net income", value: money(ni(cur)), format: "money" },
    ],
    columns: [
      { key: "line", label: "" },
      { key: "amount", label: "This period", format: "money" },
      { key: "pct", label: "% of net sales", format: "pct" },
      { key: "previous", label: `Previous ${days} day${days === 1 ? "" : "s"}`, format: "money" },
      { key: "change", label: "Change", format: "pct" },
    ],
    rows,
    note: "Cost of goods sold uses the cost saved at the time of each sale (older sales use the product's current cost). Expenses are the shift expenses recorded at the counter.",
  };
}

export async function expensesReport(ctx: ReportContext): Promise<ReportResult> {
  const expenses = await prisma.shiftExpense.findMany({
    where: { tenantId: ctx.tenantId, createdAt: { gte: ctx.from, lt: ctx.to }, shift: storeWhere(ctx) },
    select: { description: true, amount: true, createdAt: true, shift: { select: { storeId: true, user: { select: { firstName: true, lastName: true } } } } },
    orderBy: { createdAt: "desc" },
    take: 10000,
  });
  const rows = expenses.map((e) => ({
    date: e.createdAt.toISOString(),
    description: e.description,
    branch: storeName(ctx, e.shift.storeId),
    cashier: `${e.shift.user.firstName} ${e.shift.user.lastName}`.trim(),
    amount: money(n(e.amount)),
  }));
  const total = rows.reduce((s, r) => s + r.amount, 0);
  const top = new Map<string, number>();
  for (const r of rows) top.set(r.description.toLowerCase(), (top.get(r.description.toLowerCase()) ?? 0) + r.amount);
  const biggest = [...top.entries()].sort((a, b) => b[1] - a[1])[0];
  return {
    summary: [
      { label: "Expenses", value: rows.length, format: "int" },
      { label: "Total", value: money(total), format: "money" },
      { label: "Biggest item", value: biggest ? biggest[0] : "—" },
    ],
    columns: [
      { key: "date", label: "Date", format: "datetime" },
      { key: "description", label: "Description" },
      ...(ctx.storeIds?.length === 1 ? [] : [{ key: "branch", label: "Branch" }]),
      { key: "cashier", label: "Recorded by" },
      { key: "amount", label: "Amount", format: "money", total: true },
    ],
    rows,
  };
}
