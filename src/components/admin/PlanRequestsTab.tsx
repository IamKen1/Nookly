"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { formatDateTime } from "@/lib/format";

interface AdminPlanRequest {
  id: string;
  status: string;
  billingCycle: string;
  note: string | null;
  resolvedNote: string | null;
  createdAt: string;
  tenant: { id: string; name: string; slug: string; ownerEmail: string; contactNumber: string | null };
  currentPlan: { name: string };
  requestedPlan: { name: string };
  requestedByUser: { firstName: string; lastName: string; email: string };
}

const STATUS_TONE: Record<string, string> = {
  PENDING: "bg-amber-500/10 text-amber-400",
  CONTACTED: "bg-blue-500/10 text-blue-400",
  ACTIVATED: "bg-emerald-500/10 text-emerald-400",
  CANCELLED: "bg-zinc-700/40 text-zinc-400",
};

export default function PlanRequestsTab() {
  const [requests, setRequests] = useState<AdminPlanRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<"contacted" | "activate" | "cancel" | null>(null);
  const [error, setError] = useState<string | null>(null);

  // showLoading only applies to the initial fetch — refreshing after
  // contacted/activate/cancel must not flash the table back to "Loading...".
  const load = async (showLoading = false) => {
    if (showLoading) setLoading(true);
    const res = await fetch("/api/nk-ops-72fq9/plan-requests");
    const data = await res.json();
    setRequests(Array.isArray(data) ? data : []);
    if (showLoading) setLoading(false);
  };

  useEffect(() => {
    load(true);
  }, []);

  const act = async (id: string, action: "contacted" | "activate" | "cancel") => {
    if (action === "activate" && !confirm("Activate this plan for the tenant now? Only do this after payment is confirmed.")) return;
    if (action === "cancel" && !confirm("Cancel this request?")) return;
    setError(null);
    setBusyId(id);
    setBusyAction(action);
    try {
      const res = await fetch(`/api/nk-ops-72fq9/plan-requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Action failed.");
        return;
      }
      load();
    } catch {
      setError("Network error.");
    } finally {
      setBusyId(null);
      setBusyAction(null);
    }
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
      {error && <p className="border-b border-red-900/50 bg-red-950/40 px-4 py-2 text-sm text-red-400">{error}</p>}
      <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-800 text-left text-xs font-medium uppercase text-zinc-500">
            <th className="px-4 py-3">Tenant</th>
            <th className="px-4 py-3">Change</th>
            <th className="px-4 py-3">Requested by</th>
            <th className="px-4 py-3">Date</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={6} className="px-4 py-8 text-center text-zinc-500">Loading...</td>
            </tr>
          ) : requests.length === 0 ? (
            <tr>
              <td colSpan={6} className="px-4 py-8 text-center text-zinc-500">No plan change requests yet.</td>
            </tr>
          ) : (
            requests.map((r) => (
              <tr key={r.id} className="border-b border-zinc-800/60 last:border-0 align-top">
                <td className="px-4 py-3">
                  <p className="font-medium text-white">{r.tenant.name}</p>
                  <p className="text-xs text-zinc-500">{r.tenant.ownerEmail}</p>
                  {r.tenant.contactNumber && <p className="text-xs text-zinc-600">{r.tenant.contactNumber}</p>}
                </td>
                <td className="px-4 py-3">
                  <p className="text-zinc-200">
                    {r.currentPlan.name} → {r.requestedPlan.name}
                  </p>
                  <p className="text-xs text-zinc-500">{r.billingCycle}</p>
                  {r.note && <p className="mt-1 text-xs text-zinc-500">&ldquo;{r.note}&rdquo;</p>}
                </td>
                <td className="px-4 py-3 text-zinc-400">
                  {r.requestedByUser.firstName} {r.requestedByUser.lastName}
                </td>
                <td className="px-4 py-3 text-zinc-500">{formatDateTime(r.createdAt)}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_TONE[r.status] ?? "bg-zinc-700/40 text-zinc-400"}`}>
                    {r.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  {(r.status === "PENDING" || r.status === "CONTACTED") && (
                    <div className="flex justify-end gap-2">
                      {r.status === "PENDING" && (
                        <button
                          onClick={() => act(r.id, "contacted")}
                          disabled={busyId === r.id}
                          className="flex items-center justify-center gap-2 rounded-full border border-zinc-700 px-3 py-1.5 text-xs font-semibold text-zinc-200 hover:border-zinc-500 disabled:opacity-50 btn-press"
                        >
                          {busyId === r.id && busyAction === "contacted" && <Loader2 className="h-4 w-4 animate-spin" />}
                          Mark contacted
                        </button>
                      )}
                      <button
                        onClick={() => act(r.id, "activate")}
                        disabled={busyId === r.id}
                        className="flex items-center justify-center gap-2 rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50 btn-press"
                      >
                        {busyId === r.id && busyAction === "activate" && <Loader2 className="h-4 w-4 animate-spin" />}
                        Activate
                      </button>
                      <button
                        onClick={() => act(r.id, "cancel")}
                        disabled={busyId === r.id}
                        className="flex items-center justify-center gap-2 rounded-full border border-red-800 px-3 py-1.5 text-xs font-semibold text-red-400 hover:border-red-600 disabled:opacity-50 btn-press"
                      >
                        {busyId === r.id && busyAction === "cancel" && <Loader2 className="h-4 w-4 animate-spin" />}
                        Cancel
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      </div>
    </div>
  );
}
