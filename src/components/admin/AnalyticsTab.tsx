"use client";

import { useEffect, useState } from "react";
import { peso, formatDate } from "@/lib/format";

interface Analytics {
  salesTrend: { day: string; count: number; revenue: number }[];
  signupTrend: { day: string; count: number }[];
  trialsEndingSoon: { tenantName: string; tenantSlug: string; ownerEmail: string; trialEndsAt: string | null }[];
  pastDueTenants: { tenantName: string; tenantSlug: string; ownerEmail: string; planName: string }[];
  canceledLast30: number;
  arpu: number;
  trialConversionRate: number | null;
  topTenants: { id: string; name: string; slug: string; planName: string | null; saleCount: number; revenue: number }[];
}

function BarChart({ data, tone = "#34d399" }: { data: number[]; tone?: string }) {
  const max = Math.max(1, ...data);
  return (
    <svg viewBox={`0 0 ${data.length * 4} 40`} preserveAspectRatio="none" className="h-16 w-full">
      {data.map((v, i) => {
        const h = (v / max) * 38;
        return (
          <rect
            key={i}
            x={i * 4 + 0.5}
            y={40 - h}
            width={3}
            height={Math.max(h, 0.5)}
            fill={tone}
            opacity={v === 0 ? 0.15 : 0.85}
          />
        );
      })}
    </svg>
  );
}

function StatCard({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</p>
      <p className={`mt-1.5 text-2xl font-semibold ${tone ?? "text-white"}`}>{value}</p>
    </div>
  );
}

export default function AnalyticsTab() {
  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/nk-ops-72fq9/analytics")
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json()).error ?? "Failed to load analytics.");
        return res.json();
      })
      .then(setData)
      .catch((err) => setError(err.message));
  }, []);

  if (error) return <p className="text-sm text-red-400">{error}</p>;
  if (!data) return <p className="text-sm text-zinc-500">Loading...</p>;

  const revenue30 = data.salesTrend.reduce((sum, d) => sum + d.revenue, 0);
  const sales30 = data.salesTrend.reduce((sum, d) => sum + d.count, 0);
  const signups30 = data.signupTrend.reduce((sum, d) => sum + d.count, 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="ARPU (paying)" value={peso(data.arpu)} tone="text-emerald-400" />
        <StatCard
          label="Trial → paid conversion"
          value={data.trialConversionRate === null ? "—" : `${Math.round(data.trialConversionRate * 100)}%`}
        />
        <StatCard label="Canceled (30d)" value={String(data.canceledLast30)} tone={data.canceledLast30 > 0 ? "text-red-400" : undefined} />
        <StatCard label="New signups (30d)" value={String(signups30)} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
          <div className="flex items-baseline justify-between">
            <h3 className="text-sm font-semibold text-white">Revenue, last 30 days</h3>
            <span className="text-xs text-zinc-500">{peso(revenue30)} · {sales30} sales</span>
          </div>
          <div className="mt-3">
            <BarChart data={data.salesTrend.map((d) => d.revenue)} tone="#34d399" />
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
          <div className="flex items-baseline justify-between">
            <h3 className="text-sm font-semibold text-white">New tenant signups, last 30 days</h3>
            <span className="text-xs text-zinc-500">{signups30} total</span>
          </div>
          <div className="mt-3">
            <BarChart data={data.signupTrend.map((d) => d.count)} tone="#60a5fa" />
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
          <h3 className="text-sm font-semibold text-white">Trials ending in the next 7 days</h3>
          <p className="mt-0.5 text-xs text-zinc-500">Follow up before these convert or lapse.</p>
          <div className="mt-3 space-y-2">
            {data.trialsEndingSoon.length === 0 ? (
              <p className="text-sm text-zinc-500">None ending soon.</p>
            ) : (
              data.trialsEndingSoon.map((t) => (
                <div key={t.tenantSlug} className="flex items-center justify-between text-sm">
                  <div>
                    <p className="text-zinc-200">{t.tenantName}</p>
                    <p className="text-xs text-zinc-500">{t.ownerEmail}</p>
                  </div>
                  <span className="text-xs text-amber-400">{t.trialEndsAt ? formatDate(t.trialEndsAt) : "—"}</span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
          <h3 className="text-sm font-semibold text-white">Past-due subscriptions</h3>
          <p className="mt-0.5 text-xs text-zinc-500">Payment issue — reach out before they churn.</p>
          <div className="mt-3 space-y-2">
            {data.pastDueTenants.length === 0 ? (
              <p className="text-sm text-zinc-500">None past due.</p>
            ) : (
              data.pastDueTenants.map((t) => (
                <div key={t.tenantSlug} className="flex items-center justify-between text-sm">
                  <div>
                    <p className="text-zinc-200">{t.tenantName}</p>
                    <p className="text-xs text-zinc-500">{t.ownerEmail}</p>
                  </div>
                  <span className="text-xs text-red-400">{t.planName}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        <h3 className="text-sm font-semibold text-white">Top tenants by all-time revenue</h3>
        <div className="overflow-x-auto">
        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase text-zinc-500">
              <th className="pb-2">Tenant</th>
              <th className="pb-2">Plan</th>
              <th className="pb-2">Sales</th>
              <th className="pb-2">Revenue</th>
            </tr>
          </thead>
          <tbody>
            {data.topTenants.map((t) => (
              <tr key={t.id} className="border-t border-zinc-800 text-zinc-300">
                <td className="py-2">{t.name}</td>
                <td className="py-2 text-zinc-400">{t.planName ?? "—"}</td>
                <td className="py-2 text-zinc-400">{t.saleCount}</td>
                <td className="py-2 font-medium text-emerald-400">{peso(t.revenue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}
