"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, Printer } from "lucide-react";
import { peso, formatDate, formatDateTime } from "@/lib/format";

type Tab = "overview" | "income" | "inventory-dates" | "e-services";

interface UnifiedDashboard {
  summary: {
    totalTransactions: number;
    grossRevenue: number;
    netRevenue: number;
    totalCOGS: number;
    grossProfit: number;
    grossMarginPercent: number;
    vatCollected: number;
    averageSale: number;
  };
  trend: Array<{ periodKey: string; periodLabel: string; netRevenue: number; grossProfit: number; salesCount: number }>;
  topProductsByRevenue: Array<{ productId: string; productName: string; unitsSold: number; revenue: number; grossProfit: number }>;
  categorySales: Array<{ categoryName: string; revenue: number; grossProfit: number }>;
  paymentMethods: Array<{ label: string; salesCount: number; totalAmount: number }>;
}

interface IncomeReport {
  summary: { totalProducts: number; totalRevenue: number; totalCost: number; grossIncome: number; overallMarginPercent: number };
  rows: Array<{ productId: string; productName: string; unitsSold: number; totalRevenue: number; grossIncome: number; marginPercent: number }>;
}

interface InventoryDatesReport {
  summary: { totalProducts: number; expired: number; expiringSoon: number; noExpiryDate: number };
  rows: Array<{
    id: string;
    name: string;
    category: { name: string } | null;
    currentStock: number;
    expiryDate: string | null;
    daysToExpiry: number | null;
    dateStatus: string;
  }>;
}

interface CashServicesTotals {
  count: number;
  gross: number;
  fees: number;
}

interface CashServicesReport {
  generatedAt: string;
  filters: { startDate: string | null; endDate: string | null };
  summary: {
    cashIn: CashServicesTotals;
    cashOut: CashServicesTotals;
    load: CashServicesTotals;
    totalFeesEarned: number;
    netCashImpact: number;
    transactionCount: number;
  };
  providerBreakdown: Array<{ type: "CASH_IN" | "CASH_OUT" | "LOAD"; provider: string; count: number; gross: number; fees: number }>;
  trend: Array<{ periodKey: string; periodLabel: string; feesEarned: number } & Record<"CASH_IN" | "CASH_OUT" | "LOAD", CashServicesTotals>>;
  transactions: Array<{
    type: "CASH_IN" | "CASH_OUT" | "LOAD";
    provider: string;
    amount: number;
    serviceFee: number;
    referenceNumber: string | null;
    customerName: string | null;
    customerMobile: string | null;
    cashierName: string;
    createdAt: string;
  }>;
}

const TXN_TYPE_LABELS: Record<"CASH_IN" | "CASH_OUT" | "LOAD", string> = {
  CASH_IN: "Cash In",
  CASH_OUT: "Cash Out",
  LOAD: "Load",
};

const StatCard = ({ label, value, tone }: { label: string; value: string; tone?: "amber" | "red" | "emerald" }) => (
  <div className="rounded-2xl border border-zinc-200 bg-white p-5">
    <p className="text-xs font-medium text-zinc-500">{label}</p>
    <p
      className={`mt-1 text-xl font-bold ${
        tone === "amber" ? "text-amber-600" : tone === "red" ? "text-red-600" : tone === "emerald" ? "text-emerald-600" : "text-zinc-900"
      }`}
    >
      {value}
    </p>
  </div>
);

const todayStr = () => new Date().toISOString().slice(0, 10);
const firstOfMonthStr = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
};

export default function ReportsClient() {
  const [tab, setTab] = useState<Tab>("overview");
  const [loading, setLoading] = useState(true);
  const [dashboard, setDashboard] = useState<UnifiedDashboard | null>(null);
  const [income, setIncome] = useState<IncomeReport | null>(null);
  const [inventoryDates, setInventoryDates] = useState<InventoryDatesReport | null>(null);
  const [cashServices, setCashServices] = useState<CashServicesReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [cashStartDate, setCashStartDate] = useState(firstOfMonthStr());
  const [cashEndDate, setCashEndDate] = useState(todayStr());
  const [cashPeriod, setCashPeriod] = useState<"daily" | "weekly" | "monthly">("daily");

  const load = useCallback(
    async (t: Tab) => {
      setLoading(true);
      setError(null);
      try {
        if (t === "overview") {
          const res = await fetch("/api/reports/unified-dashboard?period=monthly");
          const data = await res.json();
          if (!res.ok) throw new Error(data.error);
          setDashboard(data);
        } else if (t === "income") {
          const res = await fetch("/api/reports/income");
          const data = await res.json();
          if (!res.ok) throw new Error(data.error);
          setIncome(data);
        } else if (t === "e-services") {
          const params = new URLSearchParams({ startDate: cashStartDate, endDate: cashEndDate, period: cashPeriod });
          const res = await fetch(`/api/reports/e-services?${params.toString()}`);
          const data = await res.json();
          if (!res.ok) throw new Error(data.error);
          setCashServices(data);
        } else {
          const res = await fetch("/api/reports/inventory-dates");
          const data = await res.json();
          if (!res.ok) throw new Error(data.error);
          setInventoryDates(data);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load report.");
      } finally {
        setLoading(false);
      }
    },
    [cashStartDate, cashEndDate, cashPeriod]
  );

  useEffect(() => {
    load(tab);
  }, [tab, load]);

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Reports</h1>
          <p className="mt-1 text-sm text-zinc-500">Sales, profitability, and inventory insight for your business.</p>
        </div>
        <a
          href="/api/reports/inventory-valuation"
          className="flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:border-zinc-300"
        >
          <Download className="h-4 w-4" /> Export inventory valuation
        </a>
      </div>

      <div className="mt-6 flex gap-2 border-b border-zinc-200">
        {([
          ["overview", "Overview"],
          ["income", "Income by product"],
          ["e-services", "E-Services"],
          ["inventory-dates", "Expiry monitor"],
        ] as [Tab, string][]).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2 text-sm font-semibold ${
              tab === key ? "border-b-2 border-emerald-600 text-emerald-700" : "text-zinc-500 hover:text-zinc-700"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      {loading && <p className="mt-8 text-center text-sm text-zinc-400">Loading...</p>}

      {!loading && tab === "overview" && dashboard && (
        <div className="mt-6 space-y-6">
          <div className="grid gap-4 sm:grid-cols-4">
            <StatCard label="Net revenue" value={peso(dashboard.summary.netRevenue)} />
            <StatCard label="Gross profit" value={peso(dashboard.summary.grossProfit)} tone="emerald" />
            <StatCard label="Margin" value={`${dashboard.summary.grossMarginPercent}%`} />
            <StatCard label="Transactions" value={String(dashboard.summary.totalTransactions)} />
          </div>

          <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-100 text-left text-xs font-medium uppercase text-zinc-400">
                  <th className="px-4 py-3">Period</th>
                  <th className="px-4 py-3">Sales</th>
                  <th className="px-4 py-3">Net revenue</th>
                  <th className="px-4 py-3">Gross profit</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.trend.map((row) => (
                  <tr key={row.periodKey} className="border-b border-zinc-50 last:border-0">
                    <td className="px-4 py-3 text-zinc-700">{row.periodLabel}</td>
                    <td className="px-4 py-3 text-zinc-600">{row.salesCount}</td>
                    <td className="px-4 py-3 text-zinc-900">{peso(row.netRevenue)}</td>
                    <td className="px-4 py-3 text-emerald-700">{peso(row.grossProfit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
              <div className="border-b border-zinc-100 px-4 py-3 text-sm font-semibold text-zinc-900">Top products</div>
              <table className="w-full text-sm">
                <tbody>
                  {dashboard.topProductsByRevenue.slice(0, 6).map((p) => (
                    <tr key={p.productId} className="border-b border-zinc-50 last:border-0">
                      <td className="px-4 py-2.5 text-zinc-700">{p.productName}</td>
                      <td className="px-4 py-2.5 text-right text-zinc-900">{peso(p.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
              <div className="border-b border-zinc-100 px-4 py-3 text-sm font-semibold text-zinc-900">Payment methods</div>
              <table className="w-full text-sm">
                <tbody>
                  {dashboard.paymentMethods.map((p) => (
                    <tr key={p.label} className="border-b border-zinc-50 last:border-0">
                      <td className="px-4 py-2.5 text-zinc-700">{p.label}</td>
                      <td className="px-4 py-2.5 text-right text-zinc-900">{peso(p.totalAmount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {!loading && tab === "income" && income && (
        <div className="mt-6 space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label="Total revenue" value={peso(income.summary.totalRevenue)} />
            <StatCard label="Gross income" value={peso(income.summary.grossIncome)} tone="emerald" />
            <StatCard label="Overall margin" value={`${income.summary.overallMarginPercent}%`} />
          </div>
          <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-100 text-left text-xs font-medium uppercase text-zinc-400">
                  <th className="px-4 py-3">Product</th>
                  <th className="px-4 py-3">Units sold</th>
                  <th className="px-4 py-3">Revenue</th>
                  <th className="px-4 py-3">Gross income</th>
                  <th className="px-4 py-3">Margin</th>
                </tr>
              </thead>
              <tbody>
                {income.rows.map((r) => (
                  <tr key={r.productId} className="border-b border-zinc-50 last:border-0">
                    <td className="px-4 py-3 font-medium text-zinc-900">{r.productName}</td>
                    <td className="px-4 py-3 text-zinc-600">{r.unitsSold}</td>
                    <td className="px-4 py-3 text-zinc-900">{peso(r.totalRevenue)}</td>
                    <td className="px-4 py-3 text-emerald-700">{peso(r.grossIncome)}</td>
                    <td className="px-4 py-3 text-zinc-600">{r.marginPercent}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!loading && tab === "e-services" && cashServices && (
        <div className="mt-6 space-y-6">
          <div className="flex flex-wrap items-end justify-between gap-3 rounded-2xl border border-zinc-200 bg-white p-4 print:hidden">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-500">From</label>
                <input
                  type="date"
                  value={cashStartDate}
                  max={cashEndDate}
                  onChange={(e) => setCashStartDate(e.target.value)}
                  className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-500">To</label>
                <input
                  type="date"
                  value={cashEndDate}
                  min={cashStartDate}
                  max={todayStr()}
                  onChange={(e) => setCashEndDate(e.target.value)}
                  className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-500">Group by</label>
                <select
                  value={cashPeriod}
                  onChange={(e) => setCashPeriod(e.target.value as "daily" | "weekly" | "monthly")}
                  className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                >
                  <option value="daily">Day</option>
                  <option value="weekly">Week</option>
                  <option value="monthly">Month</option>
                </select>
              </div>
            </div>
            <button
              onClick={() => window.print()}
              className="flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:border-zinc-300"
            >
              <Printer className="h-4 w-4" /> Print statement
            </button>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-6">
            <div className="border-b border-zinc-200 pb-4 text-center">
              <h2 className="text-lg font-bold text-zinc-900">E-Services Statement</h2>
              <p className="mt-1 text-sm text-zinc-500">
                E-wallet (GCash/Maya) cash in/out and prepaid load — agent revenue and cash-drawer impact
              </p>
              <p className="mt-1 text-xs text-zinc-400">
                {formatDate(cashServices.filters.startDate ?? cashStartDate)} – {formatDate(cashServices.filters.endDate ?? cashEndDate)}
              </p>
            </div>

            <div className="mt-5 space-y-1.5 text-sm">
              <div className="flex justify-between text-zinc-600">
                <span>Cash In ({cashServices.summary.cashIn.count} transactions)</span>
                <span className="font-medium text-zinc-900">{peso(cashServices.summary.cashIn.gross)}</span>
              </div>
              <div className="flex justify-between text-zinc-600">
                <span>Cash Out ({cashServices.summary.cashOut.count} transactions)</span>
                <span className="font-medium text-zinc-900">({peso(cashServices.summary.cashOut.gross)})</span>
              </div>
              <div className="flex justify-between text-zinc-600">
                <span>Prepaid Load Sold ({cashServices.summary.load.count} transactions)</span>
                <span className="font-medium text-zinc-900">{peso(cashServices.summary.load.gross)}</span>
              </div>
              <div className="flex justify-between border-t border-zinc-200 pt-1.5 font-semibold text-zinc-900">
                <span>Net Cash Impact on Drawer</span>
                <span>{peso(cashServices.summary.netCashImpact)}</span>
              </div>
              <div className="mt-3 flex justify-between border-t border-zinc-200 pt-3 text-base font-bold text-emerald-700">
                <span>Total Agent Fee Revenue</span>
                <span>{peso(cashServices.summary.totalFeesEarned)}</span>
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
            <div className="border-b border-zinc-100 px-4 py-3 text-sm font-semibold text-zinc-900">Breakdown by provider / network</div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-100 text-left text-xs font-medium uppercase text-zinc-400">
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Provider / Network</th>
                    <th className="px-4 py-3">Count</th>
                    <th className="px-4 py-3">Gross amount</th>
                    <th className="px-4 py-3">Fees earned</th>
                  </tr>
                </thead>
                <tbody>
                  {cashServices.providerBreakdown.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-zinc-400">No transactions in this period.</td>
                    </tr>
                  ) : (
                    cashServices.providerBreakdown.map((p) => (
                      <tr key={`${p.type}:${p.provider}`} className="border-b border-zinc-50 last:border-0">
                        <td className="px-4 py-3 text-zinc-600">{TXN_TYPE_LABELS[p.type]}</td>
                        <td className="px-4 py-3 font-medium text-zinc-900">{p.provider}</td>
                        <td className="px-4 py-3 text-zinc-600">{p.count}</td>
                        <td className="px-4 py-3 text-zinc-900">{peso(p.gross)}</td>
                        <td className="px-4 py-3 text-emerald-700">{peso(p.fees)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
            <div className="border-b border-zinc-100 px-4 py-3 text-sm font-semibold text-zinc-900">
              Trend by {cashPeriod === "daily" ? "day" : cashPeriod === "weekly" ? "week" : "month"}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-100 text-left text-xs font-medium uppercase text-zinc-400">
                    <th className="px-4 py-3">Period</th>
                    <th className="px-4 py-3">Cash In</th>
                    <th className="px-4 py-3">Cash Out</th>
                    <th className="px-4 py-3">Load</th>
                    <th className="px-4 py-3">Fees earned</th>
                  </tr>
                </thead>
                <tbody>
                  {cashServices.trend.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-zinc-400">No transactions in this period.</td>
                    </tr>
                  ) : (
                    cashServices.trend.map((row) => (
                      <tr key={row.periodKey} className="border-b border-zinc-50 last:border-0">
                        <td className="px-4 py-3 text-zinc-700">{row.periodLabel}</td>
                        <td className="px-4 py-3 text-zinc-600">{peso(row.CASH_IN.gross)}</td>
                        <td className="px-4 py-3 text-zinc-600">{peso(row.CASH_OUT.gross)}</td>
                        <td className="px-4 py-3 text-zinc-600">{peso(row.LOAD.gross)}</td>
                        <td className="px-4 py-3 text-emerald-700">{peso(row.feesEarned)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white print:hidden">
            <div className="border-b border-zinc-100 px-4 py-3 text-sm font-semibold text-zinc-900">Recent transactions</div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-100 text-left text-xs font-medium uppercase text-zinc-400">
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Provider</th>
                    <th className="px-4 py-3">Amount</th>
                    <th className="px-4 py-3">Fee</th>
                    <th className="px-4 py-3">Reference</th>
                    <th className="px-4 py-3">Mobile / customer</th>
                    <th className="px-4 py-3">Cashier</th>
                  </tr>
                </thead>
                <tbody>
                  {cashServices.transactions.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-zinc-400">No transactions in this period.</td>
                    </tr>
                  ) : (
                    cashServices.transactions.map((t, i) => (
                      <tr key={i} className="border-b border-zinc-50 last:border-0">
                        <td className="px-4 py-3 text-zinc-500">{formatDateTime(t.createdAt)}</td>
                        <td className="px-4 py-3 text-zinc-600">{TXN_TYPE_LABELS[t.type]}</td>
                        <td className="px-4 py-3 text-zinc-700">{t.provider}</td>
                        <td className="px-4 py-3 text-zinc-900">{peso(t.amount)}</td>
                        <td className="px-4 py-3 text-emerald-700">{peso(t.serviceFee)}</td>
                        <td className="px-4 py-3 text-zinc-500">{t.referenceNumber ?? "-"}</td>
                        <td className="px-4 py-3 text-zinc-500">{t.customerMobile ?? t.customerName ?? "-"}</td>
                        <td className="px-4 py-3 text-zinc-500">{t.cashierName}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {!loading && tab === "inventory-dates" && inventoryDates && (
        <div className="mt-6 space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label="Expired" value={String(inventoryDates.summary.expired)} tone="red" />
            <StatCard label="Expiring soon" value={String(inventoryDates.summary.expiringSoon)} tone="amber" />
            <StatCard label="No expiry set" value={String(inventoryDates.summary.noExpiryDate)} />
          </div>
          <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-100 text-left text-xs font-medium uppercase text-zinc-400">
                  <th className="px-4 py-3">Product</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Stock</th>
                  <th className="px-4 py-3">Expiry</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {inventoryDates.rows
                  .filter((r) => r.dateStatus !== "no_expiry")
                  .slice(0, 50)
                  .map((r) => (
                    <tr key={r.id} className="border-b border-zinc-50 last:border-0">
                      <td className="px-4 py-3 font-medium text-zinc-900">{r.name}</td>
                      <td className="px-4 py-3 text-zinc-600">{r.category?.name ?? "-"}</td>
                      <td className="px-4 py-3 text-zinc-600">{r.currentStock}</td>
                      <td className="px-4 py-3 text-zinc-600">{r.expiryDate ? formatDate(r.expiryDate) : "-"}</td>
                      <td className="px-4 py-3">
                        <span
                          className={
                            r.dateStatus === "expired"
                              ? "font-semibold text-red-600"
                              : r.dateStatus === "expiring_soon"
                              ? "font-semibold text-amber-600"
                              : "text-zinc-600"
                          }
                        >
                          {r.dateStatus.replace("_", " ")}
                        </span>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
