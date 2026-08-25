"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { formatDate, peso } from "@/lib/format";

interface Tenant {
  id: string;
  name: string;
  slug: string;
  ownerEmail: string;
  contactNumber: string | null;
  isActive: boolean;
  createdAt: string;
  plan: { code: string; name: string; status: string; expiresAt: string | null } | null;
  counts: { users: number; products: number; sales: number; stores: number };
}

// Highlights an already-lapsed or soon-to-lapse date so admins can spot
// tenants needing follow-up without opening each one.
const expiryTone = (expiresAt: string) => {
  const daysLeft = Math.ceil((new Date(expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (daysLeft < 0) return "text-red-400";
  if (daysLeft <= 7) return "text-amber-400";
  return "text-zinc-500";
};

interface PlanOption {
  id: string;
  code: string;
  name: string;
  priceMonthly: number;
  priceYearly: number;
}

export default function TenantsTab() {
  const router = useRouter();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [searching, setSearching] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [plans, setPlans] = useState<PlanOption[]>([]);
  const [activateTarget, setActivateTarget] = useState<Tenant | null>(null);
  const [activatePlanId, setActivatePlanId] = useState("");
  const [activateBillingCycle, setActivateBillingCycle] = useState<"MONTHLY" | "YEARLY">("MONTHLY");
  const [activating, setActivating] = useState(false);
  const [activateError, setActivateError] = useState<string | null>(null);

  // showLoading defaults to true for mount/explicit-search calls; refreshing
  // after activate/suspend/reactivate passes false so the table doesn't flash
  // back to "Loading..." over data that's still perfectly valid to show.
  const load = async (q?: string, showLoading = true) => {
    if (showLoading) setLoading(true);
    const res = await fetch(`/api/nk-ops-72fq9/tenants${q ? `?search=${encodeURIComponent(q)}` : ""}`);
    const data = await res.json();
    setTenants(Array.isArray(data) ? data : []);
    if (showLoading) setLoading(false);
  };

  const handleSearch = async () => {
    setSearching(true);
    try {
      await load(search);
    } finally {
      setSearching(false);
    }
  };

  useEffect(() => {
    load();
    fetch("/api/nk-ops-72fq9/plans")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setPlans(Array.isArray(data) ? data.filter((p: PlanOption & { isActive: boolean }) => p.isActive) : []))
      .catch(() => setPlans([]));
  }, []);

  const openActivate = (t: Tenant) => {
    setActivateTarget(t);
    setActivatePlanId(plans.find((p) => p.code === t.plan?.code)?.id ?? plans[0]?.id ?? "");
    setActivateBillingCycle("MONTHLY");
    setActivateError(null);
  };

  const submitActivate = async () => {
    if (!activateTarget || !activatePlanId) return;
    setActivating(true);
    setActivateError(null);
    try {
      const res = await fetch(`/api/nk-ops-72fq9/tenants/${activateTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "activate_plan", planId: activatePlanId, billingCycle: activateBillingCycle }),
      });
      const data = await res.json();
      if (!res.ok) {
        setActivateError(data.error ?? "Failed to activate plan.");
        return;
      }
      setActivateTarget(null);
      load(search, false);
    } catch {
      setActivateError("Network error.");
    } finally {
      setActivating(false);
    }
  };

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
      load(search, false);
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
          onClick={handleSearch}
          disabled={searching}
          className="flex items-center justify-center gap-2 rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:border-zinc-500 disabled:opacity-60 btn-press"
        >
          {searching && <Loader2 className="h-4 w-4 animate-spin" />}
          {searching ? "Searching..." : "Search"}
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
                        {t.plan.expiresAt && (
                          <p className={`text-xs ${expiryTone(t.plan.expiresAt)}`}>
                            {t.plan.status === "TRIALING" ? "Trial ends" : t.plan.status === "CANCELED" ? "Ends" : "Renews"}{" "}
                            {formatDate(t.plan.expiresAt)}
                          </p>
                        )}
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
                        onClick={() => openActivate(t)}
                        disabled={busyId === t.id}
                        className="rounded-full border border-emerald-700 px-3 py-1.5 text-xs font-semibold text-emerald-400 hover:border-emerald-500 disabled:opacity-50"
                      >
                        Activate plan
                      </button>
                      <button
                        onClick={() => impersonate(t)}
                        disabled={busyId === t.id}
                        className="flex items-center justify-center gap-2 rounded-full border border-zinc-700 px-3 py-1.5 text-xs font-semibold text-zinc-200 hover:border-zinc-500 disabled:opacity-50 btn-press"
                      >
                        {busyId === t.id && <Loader2 className="h-4 w-4 animate-spin" />}
                        Impersonate
                      </button>
                      <button
                        onClick={() => toggleActive(t)}
                        disabled={busyId === t.id}
                        className={`flex items-center justify-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold disabled:opacity-50 btn-press ${
                          t.isActive
                            ? "border border-red-800 text-red-400 hover:border-red-600"
                            : "bg-emerald-600 text-white hover:bg-emerald-500"
                        }`}
                      >
                        {busyId === t.id && <Loader2 className="h-4 w-4 animate-spin" />}
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

      {activateTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
            <h3 className="text-sm font-semibold text-white">Activate plan for {activateTarget.name}</h3>
            <p className="mt-1 text-xs text-zinc-500">
              For when the tenant already paid off-band (no in-app plan request needed). This immediately switches
              their subscription to ACTIVE and logs the payment.
            </p>

            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-400">Plan</label>
                <select
                  value={activatePlanId}
                  onChange={(e) => setActivatePlanId(e.target.value)}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white"
                >
                  {plans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-400">Billing cycle</label>
                <select
                  value={activateBillingCycle}
                  onChange={(e) => setActivateBillingCycle(e.target.value as "MONTHLY" | "YEARLY")}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white"
                >
                  <option value="MONTHLY">
                    Monthly — {peso(plans.find((p) => p.id === activatePlanId)?.priceMonthly ?? 0)}
                  </option>
                  <option value="YEARLY">
                    Yearly — {peso(plans.find((p) => p.id === activatePlanId)?.priceYearly ?? 0)}
                  </option>
                </select>
              </div>

              {activateError && <p className="text-sm text-red-400">{activateError}</p>}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setActivateTarget(null)}
                  className="rounded-full border border-zinc-700 px-4 py-2 text-sm font-semibold text-zinc-300 hover:border-zinc-500"
                >
                  Cancel
                </button>
                <button
                  onClick={submitActivate}
                  disabled={activating || !activatePlanId}
                  className="flex items-center justify-center gap-2 rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50 btn-press"
                >
                  {activating && <Loader2 className="h-4 w-4 animate-spin" />}
                  {activating ? "Activating..." : "Activate"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
