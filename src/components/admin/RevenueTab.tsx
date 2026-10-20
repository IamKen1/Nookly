"use client";

import { useCallback, useEffect, useState } from "react";
import { peso, formatDate } from "@/lib/format";
import { isCompleteDate } from "@/lib/date-input";

interface RevenueReport {
  filters: { startDate: string | null; endDate: string | null };
  summary: {
    totalRevenueCollected: number;
    invoiceCount: number;
    mrr: number;
    payingTenantsCount: number;
    arpu: number;
  };
  planBreakdown: Array<{ planName: string; payingTenants: number; mrr: number }>;
  trend: Array<{ periodKey: string; periodLabel: string; count: number; total: number }>;
  payingTenants: Array<{
    tenantName: string;
    tenantSlug: string;
    ownerEmail: string;
    planName: string;
    status: string;
    billingCycle: string;
    currentPeriodEnd: string | null;
  }>;
  complimentaryTenants: Array<{ tenantName: string; tenantSlug: string; ownerEmail: string; planName: string }>;
  payments: Array<{
    tenantName: string;
    tenantSlug: string;
    planName: string;
    billingCycle: string;
    amount: number;
    paidAt: string | null;
  }>;
}

const todayStr = () => new Date().toISOString().slice(0, 10);
const firstOfYearStr = () => `${new Date().getFullYear()}-01-01`;

export default function RevenueTab() {
  const [data, setData] = useState<RevenueReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [startDate, setStartDate] = useState(firstOfYearStr());
  const [endDate, setEndDate] = useState(todayStr());
  const [period, setPeriod] = useState<"daily" | "weekly" | "monthly">("monthly");

  const load = useCallback(async () => {
    if (!isCompleteDate(startDate) || !isCompleteDate(endDate)) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ startDate, endDate, period });
      const res = await fetch(`/api/nk-ops-72fq9/revenue?${params.toString()}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load revenue report.");
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load revenue report.");
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, period]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3 rounded-2xl border border-zinc-200 bg-white p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-500">From</label>
            <input
              type="date"
              value={startDate}
              max={endDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-500">To</label>
            <input
              type="date"
              value={endDate}
              min={startDate}
              max={todayStr()}
              onChange={(e) => setEndDate(e.target.value)}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-500">Group by</label>
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value as "daily" | "weekly" | "monthly")}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
            >
              <option value="daily">Day</option>
              <option value="weekly">Week</option>
              <option value="monthly">Month</option>
            </select>
          </div>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {loading && <p className="py-8 text-center text-sm text-zinc-500">Loading...</p>}

      {!loading && data && (
        <>
          <div className="rounded-2xl border border-zinc-200 bg-white p-6">
            <div className="border-b border-zinc-200 pb-4 text-center">
              <h2 className="text-lg font-bold text-zinc-900">Platform Revenue Statement</h2>
              <p className="mt-1 text-sm text-zinc-500">Subscription income Nookly collected from tenants — not tenant sales.</p>
              <p className="mt-1 text-xs text-zinc-400">
                {formatDate(data.filters.startDate ?? startDate)} – {formatDate(data.filters.endDate ?? endDate)}
              </p>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-4">
              <div>
                <p className="text-xs text-zinc-500">Revenue collected (period)</p>
                <p className="mt-1 text-xl font-bold text-emerald-600">{peso(data.summary.totalRevenueCollected)}</p>
                <p className="text-xs text-zinc-400">{data.summary.invoiceCount} payments</p>
              </div>
              <div>
                <p className="text-xs text-zinc-500">Current MRR</p>
                <p className="mt-1 text-xl font-bold text-zinc-900">{peso(data.summary.mrr)}</p>
                <p className="text-xs text-zinc-400">Monthly recurring, as of now</p>
              </div>
              <div>
                <p className="text-xs text-zinc-500">Paying tenants</p>
                <p className="mt-1 text-xl font-bold text-zinc-900">{data.summary.payingTenantsCount}</p>
              </div>
              <div>
                <p className="text-xs text-zinc-500">ARPU</p>
                <p className="mt-1 text-xl font-bold text-zinc-900">{peso(data.summary.arpu)}</p>
                <p className="text-xs text-zinc-400">Avg. revenue per paying tenant</p>
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
            <div className="border-b border-zinc-200 px-4 py-3 text-sm font-semibold text-zinc-900">Breakdown by plan</div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 text-left text-xs uppercase text-zinc-500">
                    <th className="px-4 py-3">Plan</th>
                    <th className="px-4 py-3">Paying tenants</th>
                    <th className="px-4 py-3">MRR</th>
                  </tr>
                </thead>
                <tbody>
                  {data.planBreakdown.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-4 py-8 text-center text-zinc-500">No paying tenants yet.</td>
                    </tr>
                  ) : (
                    data.planBreakdown.map((p) => (
                      <tr key={p.planName} className="border-b border-zinc-100 last:border-0">
                        <td className="px-4 py-3 font-medium text-zinc-900">{p.planName}</td>
                        <td className="px-4 py-3 text-zinc-500">{p.payingTenants}</td>
                        <td className="px-4 py-3 text-emerald-600">{peso(p.mrr)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
            <div className="border-b border-zinc-200 px-4 py-3 text-sm font-semibold text-zinc-900">
              Revenue trend by {period === "daily" ? "day" : period === "weekly" ? "week" : "month"}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 text-left text-xs uppercase text-zinc-500">
                    <th className="px-4 py-3">Period</th>
                    <th className="px-4 py-3">Payments</th>
                    <th className="px-4 py-3">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {data.trend.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-4 py-8 text-center text-zinc-500">No payments in this period.</td>
                    </tr>
                  ) : (
                    data.trend.map((row) => (
                      <tr key={row.periodKey} className="border-b border-zinc-100 last:border-0">
                        <td className="px-4 py-3 text-zinc-700">{row.periodLabel}</td>
                        <td className="px-4 py-3 text-zinc-500">{row.count}</td>
                        <td className="px-4 py-3 text-emerald-600">{peso(row.total)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
            <div className="border-b border-zinc-200 px-4 py-3 text-sm font-semibold text-zinc-900">
              Paying tenants ({data.payingTenants.length})
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 text-left text-xs uppercase text-zinc-500">
                    <th className="px-4 py-3">Tenant</th>
                    <th className="px-4 py-3">Plan</th>
                    <th className="px-4 py-3">Billing</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Paid until</th>
                  </tr>
                </thead>
                <tbody>
                  {data.payingTenants.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-zinc-500">No paying tenants yet.</td>
                    </tr>
                  ) : (
                    data.payingTenants.map((t) => (
                      <tr key={t.tenantSlug} className="border-b border-zinc-100 last:border-0">
                        <td className="px-4 py-3">
                          <p className="font-medium text-zinc-900">{t.tenantName}</p>
                          <p className="text-xs text-zinc-500">{t.ownerEmail}</p>
                        </td>
                        <td className="px-4 py-3 text-zinc-700">{t.planName}</td>
                        <td className="px-4 py-3 text-zinc-500">{t.billingCycle === "YEARLY" ? "Yearly" : "Monthly"}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                              t.status === "ACTIVE" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
                            }`}
                          >
                            {t.status === "ACTIVE" ? "Active" : "Past due"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-zinc-500">{t.currentPeriodEnd ? formatDate(t.currentPeriodEnd) : "-"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {data.complimentaryTenants.length > 0 && (
            <div className="rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm">
              <p className="font-semibold text-violet-900">
                Complimentary — free access, excluded from everything above ({data.complimentaryTenants.length})
              </p>
              <ul className="mt-1.5 space-y-0.5 text-violet-800">
                {data.complimentaryTenants.map((t) => (
                  <li key={t.tenantSlug}>
                    {t.tenantName} <span className="text-violet-600">· {t.planName} · {t.ownerEmail}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
            <div className="border-b border-zinc-200 px-4 py-3 text-sm font-semibold text-zinc-900">Recent payments</div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 text-left text-xs uppercase text-zinc-500">
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Tenant</th>
                    <th className="px-4 py-3">Plan</th>
                    <th className="px-4 py-3">Billing</th>
                    <th className="px-4 py-3">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {data.payments.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-zinc-500">No payments in this period.</td>
                    </tr>
                  ) : (
                    data.payments.map((p, i) => (
                      <tr key={i} className="border-b border-zinc-100 last:border-0">
                        <td className="px-4 py-3 text-zinc-500">{p.paidAt ? formatDate(p.paidAt) : "-"}</td>
                        <td className="px-4 py-3 text-zinc-900">{p.tenantName}</td>
                        <td className="px-4 py-3 text-zinc-700">{p.planName}</td>
                        <td className="px-4 py-3 text-zinc-500">{p.billingCycle === "YEARLY" ? "Yearly" : "Monthly"}</td>
                        <td className="px-4 py-3 text-emerald-600">{peso(p.amount)}</td>
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
