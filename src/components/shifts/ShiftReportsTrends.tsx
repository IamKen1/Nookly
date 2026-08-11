"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { peso } from "@/lib/format";

interface Bucket {
  key: string;
  label: string;
  periodStart: string;
  periodEnd: string;
  salesCount: number;
  grossSales: number;
  discountAmount: number;
  netSales: number;
  shiftsCount: number;
  cashVariance: number;
  cashInCount: number;
  cashInTotal: number;
  cashOutCount: number;
  cashOutTotal: number;
  feesEarned: number;
}

const PERIODS: { key: "daily" | "weekly" | "monthly" | "yearly"; label: string }[] = [
  { key: "daily", label: "Daily" },
  { key: "weekly", label: "Weekly" },
  { key: "monthly", label: "Monthly" },
  { key: "yearly", label: "Yearly" },
];

function BarChart({ data, tone = "#059669" }: { data: number[]; tone?: string }) {
  const max = Math.max(1, ...data.map((v) => Math.abs(v)));
  const hasNegative = data.some((v) => v < 0);
  return (
    <svg viewBox={`0 0 ${data.length * 4} 40`} preserveAspectRatio="none" className="h-16 w-full">
      {hasNegative && <line x1={0} y1={20} x2={data.length * 4} y2={20} stroke="#e5e7eb" strokeWidth={0.5} />}
      {data.map((v, i) => {
        const mid = hasNegative ? 20 : 40;
        const h = (Math.abs(v) / max) * (hasNegative ? 18 : 38);
        const y = v >= 0 ? mid - h : mid;
        return (
          <rect
            key={i}
            x={i * 4 + 0.5}
            y={y}
            width={3}
            height={Math.max(h, 0.5)}
            fill={v < 0 ? "#dc2626" : tone}
            opacity={v === 0 ? 0.15 : 0.85}
          />
        );
      })}
    </svg>
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

function toCsv(buckets: Bucket[]): string {
  const headers = [
    "Period", "Start", "End", "Sales Count", "Gross Sales", "Discounts", "Net Sales",
    "Shifts Closed", "Cash Variance", "Cash-In Count", "Cash-In Total", "Cash-Out Count", "Cash-Out Total", "Fees Earned",
  ];
  const rows = buckets.map((b) => [
    b.label, b.periodStart, b.periodEnd, b.salesCount, b.grossSales.toFixed(2), b.discountAmount.toFixed(2), b.netSales.toFixed(2),
    b.shiftsCount, b.cashVariance.toFixed(2), b.cashInCount, b.cashInTotal.toFixed(2), b.cashOutCount, b.cashOutTotal.toFixed(2), b.feesEarned.toFixed(2),
  ]);
  return [headers, ...rows].map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
}

export default function ShiftReportsTrends() {
  const [period, setPeriod] = useState<"daily" | "weekly" | "monthly" | "yearly">("daily");
  const [buckets, setBuckets] = useState<Bucket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/shifts/reports?period=${period}`)
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json()).error ?? "Failed to load report.");
        return res.json();
      })
      .then((data) => setBuckets(data.buckets ?? []))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [period]);

  const totalNetSales = buckets.reduce((s, b) => s + b.netSales, 0);
  const totalVariance = buckets.reduce((s, b) => s + b.cashVariance, 0);
  const totalCashIn = buckets.reduce((s, b) => s + b.cashInTotal, 0);
  const totalCashOut = buckets.reduce((s, b) => s + b.cashOutTotal, 0);
  const totalFees = buckets.reduce((s, b) => s + b.feesEarned, 0);

  const exportCsv = () => {
    const csv = toCsv(buckets);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${period}-cash-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex items-center rounded-full border border-zinc-200 bg-zinc-50 p-1">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
                period === p.key ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <button
          onClick={exportCsv}
          disabled={buckets.length === 0}
          className="flex items-center gap-1.5 rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:border-zinc-400 disabled:opacity-50"
        >
          <Download className="h-3.5 w-3.5" />
          Export CSV
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {loading ? (
        <p className="text-sm text-zinc-400">Loading...</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Net sales" value={peso(totalNetSales)} tone="text-emerald-600" />
            <StatCard
              label="Cash variance"
              value={`${totalVariance >= 0 ? "+" : ""}${peso(totalVariance)}`}
              tone={totalVariance === 0 ? undefined : totalVariance > 0 ? "text-emerald-600" : "text-red-600"}
            />
            <StatCard label="E-wallet volume" value={peso(totalCashIn + totalCashOut)} />
            <StatCard label="E-wallet fees earned" value={peso(totalFees)} tone="text-emerald-600" />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-zinc-200 bg-white p-4">
              <h3 className="text-sm font-semibold text-zinc-900">Net sales trend</h3>
              <div className="mt-3">
                <BarChart data={buckets.map((b) => b.netSales)} tone="#059669" />
              </div>
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-white p-4">
              <h3 className="text-sm font-semibold text-zinc-900">Cash variance trend</h3>
              <p className="text-xs text-zinc-400">Green = over, red = short, per closed shift total</p>
              <div className="mt-3">
                <BarChart data={buckets.map((b) => b.cashVariance)} tone="#059669" />
              </div>
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-white p-4">
              <h3 className="text-sm font-semibold text-zinc-900">E-wallet cash-in trend</h3>
              <div className="mt-3">
                <BarChart data={buckets.map((b) => b.cashInTotal)} tone="#2563eb" />
              </div>
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-white p-4">
              <h3 className="text-sm font-semibold text-zinc-900">E-wallet cash-out trend</h3>
              <div className="mt-3">
                <BarChart data={buckets.map((b) => b.cashOutTotal)} tone="#d97706" />
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
            <div className="border-b border-zinc-100 px-4 py-3 text-sm font-semibold text-zinc-900">Period breakdown</div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase text-zinc-400">
                    <th className="px-4 py-2">Period</th>
                    <th className="px-4 py-2">Sales</th>
                    <th className="px-4 py-2">Net sales</th>
                    <th className="px-4 py-2">Shifts</th>
                    <th className="px-4 py-2">Cash variance</th>
                    <th className="px-4 py-2">Cash in</th>
                    <th className="px-4 py-2">Cash out</th>
                    <th className="px-4 py-2">Fees</th>
                  </tr>
                </thead>
                <tbody>
                  {buckets.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-zinc-400">No data for this range.</td>
                    </tr>
                  ) : (
                    buckets.map((b) => (
                      <tr key={b.key} className="border-t border-zinc-50">
                        <td className="px-4 py-2.5 font-medium text-zinc-900">{b.label}</td>
                        <td className="px-4 py-2.5 text-zinc-600">{b.salesCount}</td>
                        <td className="px-4 py-2.5 text-zinc-600">{peso(b.netSales)}</td>
                        <td className="px-4 py-2.5 text-zinc-600">{b.shiftsCount}</td>
                        <td className={`px-4 py-2.5 font-medium ${b.cashVariance === 0 ? "text-zinc-500" : b.cashVariance > 0 ? "text-emerald-600" : "text-red-600"}`}>
                          {b.cashVariance === 0 ? "—" : `${b.cashVariance > 0 ? "+" : ""}${peso(b.cashVariance)}`}
                        </td>
                        <td className="px-4 py-2.5 text-zinc-600">{b.cashInTotal > 0 ? peso(b.cashInTotal) : "—"}</td>
                        <td className="px-4 py-2.5 text-zinc-600">{b.cashOutTotal > 0 ? peso(b.cashOutTotal) : "—"}</td>
                        <td className="px-4 py-2.5 text-zinc-600">{b.feesEarned > 0 ? peso(b.feesEarned) : "—"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
