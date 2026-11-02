import { prisma } from "@/lib/prisma";
import { supplierBalances } from "@/lib/payables";
import { getInventoryValue } from "@/lib/dashboard-data";
import type { ReportResult } from "./registry";
import { type ReportContext, money, saleWhere } from "./context";
import { paymentMethods, salesByBranch, salesByCashier, salesByCategory, salesByProduct, salesSummary } from "./sales";
import { profitLoss } from "./finance";

const pct = (a: number, b: number) => (b ? money(((a - b) / Math.abs(b)) * 100) : null);

// One page of everything an owner checks first: key figures against the
// previous period of the same length, then the breakdowns behind them.
export async function overview(ctx: ReportContext & { canPay?: boolean }): Promise<ReportResult> {
  const [summary, pl, products, categories, payments, cashiers, branches, prevCount, stock, payables] = await Promise.all([
    salesSummary(ctx),
    profitLoss(ctx),
    salesByProduct(ctx),
    salesByCategory(ctx),
    paymentMethods(ctx),
    salesByCashier(ctx),
    ctx.storeIds?.length === 1 ? null : salesByBranch(ctx),
    (async () => {
      const days = ctx.to.getTime() - ctx.from.getTime();
      const prev = { ...ctx, from: new Date(ctx.from.getTime() - days), to: ctx.from };
      return prisma.sale.count({ where: saleWhere(prev, "sales") });
    })(),
    getInventoryValue({ session: { tenantId: ctx.tenantId }, storeId: ctx.storeIds?.length === 1 ? ctx.storeIds[0] : null }),
    ctx.canPay ? supplierBalances(ctx.tenantId) : null,
  ]);

  const line = (label: string) => pl.rows.find((r) => r.line === label) as { amount: number; previous: number } | undefined;
  const v = (label: string) => line(label)?.amount ?? 0;
  const p = (label: string) => line(label)?.previous ?? 0;
  const tx = summary.rows.reduce((s, r) => s + Number(r.transactions ?? 0), 0);
  const net = v("Net sales (VAT-inclusive)");
  const netPrev = p("Net sales (VAT-inclusive)");
  const gp = v("Gross profit");
  const netOfVat = v("Net sales (net of VAT)");
  const owed = payables ? [...payables.values()].reduce((s, b) => s + Math.max(0, b.balance), 0) : null;
  const overdue = payables ? [...payables.values()].reduce((s, b) => s + b.overdue, 0) : null;

  const trend = summary.rows.map((r) => ({ date: r.date, transactions: r.transactions, net: r.net, average: r.average }));
  const top = (rows: Record<string, string | number | null>[], n: number) => rows.slice(0, n);

  return {
    summary: [
      { label: "Net sales", value: money(net), format: "money", change: pct(net, netPrev) },
      { label: "Transactions", value: tx, format: "int", change: pct(tx, prevCount) },
      { label: "Average sale", value: tx ? money(net / tx) : 0, format: "money", change: pct(tx ? net / tx : 0, prevCount ? netPrev / prevCount : 0) },
      { label: "Gross profit", value: money(gp), format: "money", change: pct(gp, p("Gross profit")) },
      { label: "Gross margin", value: netOfVat ? money((gp / netOfVat) * 100) : 0, format: "pct" },
      { label: "Net income", value: money(v("Net income")), format: "money", change: pct(v("Net income"), p("Net income")) },
      { label: "Discounts + SC/PWD VAT", value: money(-(v("Less: discounts") + v("Less: VAT exemption (SC/PWD)"))), format: "money" },
      { label: "Returns", value: money(-v("Less: returns")), format: "money" },
      { label: "Output VAT", value: money(-v("Less: output VAT")), format: "money" },
      { label: "Cost of inventory", value: money(stock.cost), format: "money" },
      ...(owed !== null ? [{ label: "Owed to suppliers", value: money(owed), format: "money" as const }, { label: "Overdue to suppliers", value: money(overdue ?? 0), format: "money" as const }] : []),
    ],
    columns: [
      { key: "date", label: "Date", format: "date" },
      { key: "transactions", label: "Trans.", format: "int", total: true },
      { key: "net", label: "Net sales", format: "money", total: true },
      { key: "average", label: "Avg sale", format: "money" },
    ],
    rows: trend,
    barKey: "net",
    sections: [
      { title: "Profit & loss", columns: pl.columns, rows: pl.rows },
      { title: "Top 10 products", columns: products.columns.filter((c) => ["product", "netQty", "net", "profit", "margin"].includes(c.key)), rows: top(products.rows, 10), barKey: "net" },
      { title: "Sales by category", columns: categories.columns.filter((c) => ["category", "net", "profit", "share"].includes(c.key)), rows: categories.rows, barKey: "net" },
      { title: "Payment methods", columns: payments.columns.filter((c) => ["method", "provider", "transactions", "amount", "share"].includes(c.key)), rows: payments.rows, barKey: "amount" },
      { title: "Cashiers", columns: cashiers.columns.filter((c) => ["cashier", "transactions", "net", "average", "voids"].includes(c.key)), rows: cashiers.rows, barKey: "net" },
      ...(branches ? [{ title: "Branches", columns: branches.columns.filter((c) => ["branch", "transactions", "net", "profit", "margin", "share"].includes(c.key)), rows: branches.rows, barKey: "net" }] : []),
    ],
    note: "Changes compare with the previous period of the same length. Net sales are after discounts, SC/PWD VAT exemption, and returns.",
  };
}
