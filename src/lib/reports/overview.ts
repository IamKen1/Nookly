import type { ReportResult } from "./registry";
import { type ReportContext, money, phDay } from "./context";
import { paymentMethods, salesByBranch, salesByProduct, salesSummary } from "./sales";
import { expensesReport, profitLoss } from "./finance";

const pct = (a: number, b: number) => (b ? money(((a - b) / Math.abs(b)) * 100) : null);

// The first thing an owner checks: what came in, what went out, and what's
// left — net sales less expenses (counter expenses and payments to
// suppliers) — against the previous period of the same length.
export async function overview(ctx: ReportContext): Promise<ReportResult> {
  const span = ctx.to.getTime() - ctx.from.getTime();
  const prevCtx = { ...ctx, from: new Date(ctx.from.getTime() - span), to: ctx.from, fromKey: phDay(new Date(ctx.from.getTime() - span)), toKey: phDay(new Date(ctx.from.getTime() - 1)) };
  const [pl, summary, expenses, prevSummary, prevExpenses, products, payments, branches] = await Promise.all([
    profitLoss(ctx),
    salesSummary(ctx),
    expensesReport(ctx),
    salesSummary(prevCtx),
    expensesReport(prevCtx),
    salesByProduct(ctx),
    paymentMethods(ctx),
    ctx.storeIds?.length === 1 ? null : salesByBranch(ctx),
  ]);

  const total = (rows: Record<string, string | number | null>[], key: string) => money(rows.reduce((s, r) => s + Number(r[key] ?? 0), 0));
  const net = total(summary.rows, "net");
  const tx = total(summary.rows, "transactions");
  const spent = total(expenses.rows, "amount");
  const prevNet = total(prevSummary.rows, "net");
  const prevTx = total(prevSummary.rows, "transactions");
  const prevSpent = total(prevExpenses.rows, "amount");
  // Gross profit = net sales (net of VAT) − cost of goods sold, from the P&L.
  const plLine = (label: string) => pl.rows.find((r) => r.line === label) as { amount: number; previous: number } | undefined;
  const gp = plLine("Gross profit")?.amount ?? 0;
  const gpPrev = plLine("Gross profit")?.previous ?? 0;
  const netOfVat = plLine("Net sales (net of VAT)")?.amount ?? 0;
  const netOfVatPrev = plLine("Net sales (net of VAT)")?.previous ?? 0;
  const margin = netOfVat ? money((gp / netOfVat) * 100) : 0;
  const marginPrev = netOfVatPrev ? (gpPrev / netOfVatPrev) * 100 : 0;

  // Expenses per day, to sit beside each day's sales.
  const spentByDay = new Map<string, number>();
  for (const e of expenses.rows) {
    const day = phDay(new Date(String(e.date)));
    spentByDay.set(day, (spentByDay.get(day) ?? 0) + Number(e.amount ?? 0));
  }
  // Only days with sales or expenses, so a quiet month stays short.
  const rows = summary.rows
    .map((r) => {
      const out = money(spentByDay.get(String(r.date)) ?? 0);
      return { date: r.date, transactions: r.transactions, net: r.net, expenses: out, income: money(Number(r.net) - out) };
    })
    .filter((r) => Number(r.transactions) > 0 || Number(r.net) !== 0 || r.expenses !== 0);

  return {
    summary: [
      { label: "Net sales", value: net, format: "money", change: pct(net, prevNet) },
      { label: "Gross profit", value: money(gp), format: "money", change: pct(gp, gpPrev) },
      { label: "Gross margin", value: margin, format: "pct", change: marginPrev ? money(margin - marginPrev) : null },
      { label: "Expenses", value: spent, format: "money", change: pct(spent, prevSpent) },
      { label: "Net income", value: money(net - spent), format: "money", change: pct(net - spent, prevNet - prevSpent) },
      { label: "Transactions", value: tx, format: "int", change: pct(tx, prevTx) },
    ],
    columns: [
      { key: "date", label: "Date", format: "date" },
      { key: "transactions", label: "Trans.", format: "int", total: true },
      { key: "net", label: "Net sales", format: "money", total: true },
      { key: "expenses", label: "Expenses", format: "money", total: true },
      { key: "income", label: "Net income", format: "money", total: true },
    ],
    rows,
    barKey: "net",
    sections: [
      { title: "Top 10 products", columns: products.columns.filter((c) => ["product", "netQty", "net"].includes(c.key)), rows: products.rows.slice(0, 10), barKey: "net" },
      { title: "Payment methods", columns: payments.columns.filter((c) => ["method", "provider", "transactions", "amount"].includes(c.key)), rows: payments.rows, barKey: "amount" },
      ...(branches ? [{ title: "Branches", columns: branches.columns.filter((c) => ["branch", "transactions", "net", "share"].includes(c.key)), rows: branches.rows, barKey: "net" }] : []),
    ],
    note: "Gross profit = net sales (net of VAT) − cost of goods sold; margin's change is in points. Net income = net sales − expenses. Expenses are those recorded at the counter plus payments to suppliers (see Expenses & payouts). Changes compare with the previous period of the same length.",
  };
}
