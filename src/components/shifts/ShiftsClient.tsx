"use client";

import { useEffect, useState } from "react";
import { peso, formatDateTime } from "@/lib/format";
import ShiftReportsTrends from "./ShiftReportsTrends";

interface DailyClosing {
  date: string;
  salesCount: number;
  grossSales: number;
  discountAmount: number;
  taxAmount: number;
  netSales: number;
  paymentMethods: { method: string; salesCount: number; totalAmount: number }[];
  returnsCount: number;
  returnsAmount: number;
  voidedCount: number;
  totalCashVariance: number;
  eWallet: {
    cashInCount: number;
    cashInTotal: number;
    cashOutCount: number;
    cashOutTotal: number;
    feesEarned: number;
  };
  shifts: {
    id: string;
    cashierName: string;
    openedAt: string;
    closedAt: string | null;
    startingCash: number;
    endingCash: number | null;
    expectedCash: number | null;
    variance: number | null;
  }[];
}

const METHOD_LABELS: Record<string, string> = {
  CASH: "Cash",
  CREDIT_CARD: "Credit Card",
  DEBIT_CARD: "Debit Card",
  INSURANCE: "Insurance",
  CHECK: "Check",
  SPLIT: "Split",
};

const todayStr = () => new Date().toISOString().slice(0, 10);

function DailyClosingView() {
  const [date, setDate] = useState(todayStr());
  const [data, setData] = useState<DailyClosing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/shifts/daily-closing?date=${date}`)
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json()).error ?? "Failed to load.");
        return res.json();
      })
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [date]);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-zinc-500">Cash handover between cashiers, and end-of-day totals for the branch.</p>
        <input
          type="date"
          value={date}
          max={todayStr()}
          onChange={(e) => setDate(e.target.value)}
          className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
        />
      </div>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      {loading ? (
        <p className="mt-6 text-sm text-zinc-400">Loading...</p>
      ) : data ? (
        <div className="mt-6 space-y-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Sales" value={String(data.salesCount)} />
            <StatCard label="Gross sales" value={peso(data.grossSales)} />
            <StatCard label="Net sales" value={peso(data.netSales)} tone="text-emerald-600" />
            <StatCard
              label="Cash variance"
              value={peso(Math.abs(data.totalCashVariance))}
              tone={data.totalCashVariance === 0 ? undefined : data.totalCashVariance > 0 ? "text-emerald-600" : "text-red-600"}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-zinc-200 bg-white p-4">
              <h3 className="text-sm font-semibold text-zinc-900">Payment methods</h3>
              <div className="mt-3 space-y-2 text-sm">
                {data.paymentMethods.length === 0 ? (
                  <p className="text-zinc-400">No sales yet.</p>
                ) : (
                  data.paymentMethods.map((m) => (
                    <div key={m.method} className="flex justify-between text-zinc-600">
                      <span>{METHOD_LABELS[m.method] ?? m.method} ({m.salesCount})</span>
                      <span className="font-medium text-zinc-900">{peso(m.totalAmount)}</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-white p-4">
              <h3 className="text-sm font-semibold text-zinc-900">Adjustments</h3>
              <div className="mt-3 space-y-2 text-sm text-zinc-600">
                <div className="flex justify-between"><span>Discounts given</span><span>-{peso(data.discountAmount)}</span></div>
                <div className="flex justify-between"><span>VAT collected</span><span>{peso(data.taxAmount)}</span></div>
                <div className="flex justify-between"><span>Returns ({data.returnsCount})</span><span>{peso(data.returnsAmount)}</span></div>
                <div className="flex justify-between"><span>Voided sales</span><span>{data.voidedCount}</span></div>
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-white p-4">
              <h3 className="text-sm font-semibold text-zinc-900">E-wallet services (GCash/Maya)</h3>
              <div className="mt-3 space-y-2 text-sm text-zinc-600">
                <div className="flex justify-between"><span>Cash in ({data.eWallet.cashInCount})</span><span>{peso(data.eWallet.cashInTotal)}</span></div>
                <div className="flex justify-between"><span>Cash out ({data.eWallet.cashOutCount})</span><span>{peso(data.eWallet.cashOutTotal)}</span></div>
                <div className="flex justify-between font-medium text-emerald-600"><span>Fees earned</span><span>{peso(data.eWallet.feesEarned)}</span></div>
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
            <div className="border-b border-zinc-100 px-4 py-3 text-sm font-semibold text-zinc-900">Shifts this day</div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-zinc-400">
                  <th className="px-4 py-2">Cashier</th>
                  <th className="px-4 py-2">Opened</th>
                  <th className="px-4 py-2">Closed</th>
                  <th className="px-4 py-2">Starting</th>
                  <th className="px-4 py-2">Expected</th>
                  <th className="px-4 py-2">Counted</th>
                  <th className="px-4 py-2">Variance</th>
                </tr>
              </thead>
              <tbody>
                {data.shifts.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-zinc-400">No shifts opened this day.</td>
                  </tr>
                ) : (
                  data.shifts.map((s) => (
                    <tr key={s.id} className="border-t border-zinc-50">
                      <td className="px-4 py-2.5 font-medium text-zinc-900">{s.cashierName}</td>
                      <td className="px-4 py-2.5 text-zinc-500">{formatDateTime(s.openedAt)}</td>
                      <td className="px-4 py-2.5 text-zinc-500">{s.closedAt ? formatDateTime(s.closedAt) : <span className="text-amber-600">Open</span>}</td>
                      <td className="px-4 py-2.5 text-zinc-600">{peso(s.startingCash)}</td>
                      <td className="px-4 py-2.5 text-zinc-600">{s.expectedCash != null ? peso(s.expectedCash) : "—"}</td>
                      <td className="px-4 py-2.5 text-zinc-600">{s.endingCash != null ? peso(s.endingCash) : "—"}</td>
                      <td className="px-4 py-2.5">
                        {s.variance == null ? (
                          "—"
                        ) : (
                          <span className={`font-semibold ${s.variance === 0 ? "text-zinc-500" : s.variance > 0 ? "text-emerald-600" : "text-red-600"}`}>
                            {s.variance === 0 ? "Balanced" : `${s.variance > 0 ? "+" : ""}${peso(s.variance)}`}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}

const TABS = [
  { key: "daily-closing", label: "Daily closing" },
  { key: "trends", label: "Trends" },
] as const;

export default function ShiftsClient() {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("daily-closing");

  return (
    <div>
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">Shifts &amp; cash reports</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Day-by-day cash handover between cashiers, plus daily / weekly / monthly / yearly trends across sales, cash
          variance, and e-wallet services.
        </p>
      </div>

      <nav className="mt-6 mb-6 flex gap-1 border-b border-zinc-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`border-b-2 px-4 py-2.5 text-sm font-medium transition ${
              tab === t.key ? "border-emerald-600 text-zinc-900" : "border-transparent text-zinc-500 hover:text-zinc-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === "daily-closing" ? <DailyClosingView /> : <ShiftReportsTrends />}
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">{label}</p>
      <p className={`mt-1.5 text-2xl font-semibold ${tone ?? "text-zinc-900"}`}>{value}</p>
    </div>
  );
}
