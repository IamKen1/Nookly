"use client";

import { useEffect, useState } from "react";
import { peso, formatDate } from "@/lib/format";

interface Overview {
  tenants: { total: number; active: number; suspended: number };
  subscriptions: { trialing: number; active: number; pastDue: number; canceled: number };
  users: number;
  products: number;
  sales: { allTimeCount: number; allTimeRevenue: number; todayCount: number; todayRevenue: number };
  pendingPlanRequests: number;
  estimatedMrr: number;
  planBreakdown: { code: string; name: string; tenantCount: number }[];
  recentTenants: { id: string; name: string; slug: string; createdAt: string; planName: string | null; status: string | null }[];
}

function StatCard({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</p>
      <p className={`mt-1.5 text-2xl font-semibold ${tone ?? "text-white"}`}>{value}</p>
    </div>
  );
}

export default function OverviewTab() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/nk-ops-72fq9/overview")
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json()).error ?? "Failed to load overview.");
        return res.json();
      })
      .then(setData)
      .catch((err) => setError(err.message));
  }, []);

  if (error) return <p className="text-sm text-red-400">{error}</p>;
  if (!data) return <p className="text-sm text-zinc-500">Loading...</p>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Tenants" value={`${data.tenants.active} active`} />
        <StatCard label="Suspended" value={String(data.tenants.suspended)} tone={data.tenants.suspended > 0 ? "text-amber-400" : undefined} />
        <StatCard label="Est. MRR" value={peso(data.estimatedMrr)} tone="text-emerald-400" />
        <StatCard label="Pending plan requests" value={String(data.pendingPlanRequests)} tone={data.pendingPlanRequests > 0 ? "text-amber-400" : undefined} />
        <StatCard label="Active users" value={String(data.users)} />
        <StatCard label="Active products" value={String(data.products)} />
        <StatCard label="Sales today" value={`${data.sales.todayCount} · ${peso(data.sales.todayRevenue)}`} />
        <StatCard label="Sales all-time" value={`${data.sales.allTimeCount} · ${peso(data.sales.allTimeRevenue)}`} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
          <h3 className="text-sm font-semibold text-white">Subscription status</h3>
          <div className="mt-3 space-y-2 text-sm">
            {Object.entries(data.subscriptions).map(([key, count]) => (
              <div key={key} className="flex items-center justify-between text-zinc-400">
                <span className="capitalize">{key.replace(/([A-Z])/g, " $1")}</span>
                <span className="font-medium text-zinc-200">{count}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
          <h3 className="text-sm font-semibold text-white">Plan breakdown</h3>
          <div className="mt-3 space-y-2 text-sm">
            {data.planBreakdown.map((p) => (
              <div key={p.code} className="flex items-center justify-between text-zinc-400">
                <span>{p.name}</span>
                <span className="font-medium text-zinc-200">{p.tenantCount} tenants</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        <h3 className="text-sm font-semibold text-white">Recently signed up</h3>
        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase text-zinc-500">
              <th className="pb-2">Tenant</th>
              <th className="pb-2">Plan</th>
              <th className="pb-2">Status</th>
              <th className="pb-2">Joined</th>
            </tr>
          </thead>
          <tbody>
            {data.recentTenants.map((t) => (
              <tr key={t.id} className="border-t border-zinc-800 text-zinc-300">
                <td className="py-2">{t.name}</td>
                <td className="py-2 text-zinc-400">{t.planName ?? "—"}</td>
                <td className="py-2 text-zinc-400">{t.status ?? "—"}</td>
                <td className="py-2 text-zinc-500">{formatDate(t.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
