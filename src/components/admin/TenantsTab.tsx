"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDate } from "@/lib/format";

interface Tenant {
  id: string;
  name: string;
  slug: string;
  ownerEmail: string;
  contactNumber: string | null;
  isActive: boolean;
  createdAt: string;
  plan: { code: string; name: string; status: string } | null;
  counts: { users: number; products: number; sales: number; stores: number };
}

export default function TenantsTab() {
  const router = useRouter();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async (q?: string) => {
    setLoading(true);
    const res = await fetch(`/api/nk-ops-72fq9/tenants${q ? `?search=${encodeURIComponent(q)}` : ""}`);
    const data = await res.json();
    setTenants(Array.isArray(data) ? data : []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const toggleActive = async (t: Tenant) => {
    const action = t.isActive ? "suspend" : "reactivate";
    if (action === "suspend" && !confirm(`Suspend "${t.name}"? Their users will be unable to log in.`)) return;
    setBusyId(t.id);
    setError(null);
    try {
      const res = await fetch(`/api/nk-ops-72fq9/tenants/${t.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Action failed.");
        return;
      }
      load(search);
    } finally {
      setBusyId(null);
    }
  };

  const impersonate = async (t: Tenant) => {
    if (!confirm(`Sign in as the owner of "${t.name}"? You can return to admin from the banner shown while impersonating.`)) return;
    setBusyId(t.id);
    setError(null);
    try {
      const res = await fetch("/api/nk-ops-72fq9/impersonate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId: t.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not impersonate this tenant.");
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && load(search)}
          placeholder="Search by name, slug, or owner email..."
          className="w-full max-w-sm rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-zinc-500"
        />
        <button
          onClick={() => load(search)}
          className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:border-zinc-500"
        >
          Search
        </button>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-left text-xs uppercase text-zinc-500">
              <th className="px-4 py-3">Tenant</th>
              <th className="px-4 py-3">Plan</th>
              <th className="px-4 py-3">Usage</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Joined</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-zinc-500">Loading...</td></tr>
            ) : tenants.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-zinc-500">No tenants found.</td></tr>
            ) : (
              tenants.map((t) => (
                <tr key={t.id} className="border-b border-zinc-800/60 last:border-0 align-top">
                  <td className="px-4 py-3">
                    <p className="font-medium text-white">{t.name}</p>
                    <p className="text-xs text-zinc-500">{t.ownerEmail}</p>
                  </td>
                  <td className="px-4 py-3 text-zinc-300">
                    {t.plan ? (
                      <>
                        {t.plan.name}
                        <p className="text-xs text-zinc-500">{t.plan.status}</p>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-400">
                    {t.counts.users} users · {t.counts.products} products · {t.counts.sales} sales · {t.counts.stores} stores
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                        t.isActive ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
                      }`}
                    >
                      {t.isActive ? "Active" : "Suspended"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-zinc-500">{formatDate(t.createdAt)}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => impersonate(t)}
                        disabled={busyId === t.id}
                        className="rounded-full border border-zinc-700 px-3 py-1.5 text-xs font-semibold text-zinc-200 hover:border-zinc-500 disabled:opacity-50"
                      >
                        Impersonate
                      </button>
                      <button
                        onClick={() => toggleActive(t)}
                        disabled={busyId === t.id}
                        className={`rounded-full px-3 py-1.5 text-xs font-semibold disabled:opacity-50 ${
                          t.isActive
                            ? "border border-red-800 text-red-400 hover:border-red-600"
                            : "bg-emerald-600 text-white hover:bg-emerald-500"
                        }`}
                      >
                        {t.isActive ? "Suspend" : "Reactivate"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}
