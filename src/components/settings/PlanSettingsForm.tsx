"use client";

import { useEffect, useState } from "react";
import { formatLimit } from "@/lib/plans";
import { peso, formatDate } from "@/lib/format";

interface CurrentPlan {
  code: string;
  name: string;
  status: string;
  billingCycle: "MONTHLY" | "YEARLY";
  currentPeriodEnd: string | null;
  trialEndsAt: string | null;
  maxStores: number;
  maxUsers: number;
  maxProducts: number;
}

interface PlanOption {
  code: string;
  name: string;
  priceMonthly: number;
  priceYearly: number;
}

interface PlanChangeRequest {
  id: string;
  status: string;
  billingCycle: string;
  note: string | null;
  createdAt: string;
  currentPlan: { name: string };
  requestedPlan: { name: string };
}

const STATUS_TONE: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-700",
  CONTACTED: "bg-blue-100 text-blue-700",
  ACTIVATED: "bg-emerald-100 text-emerald-700",
  CANCELLED: "bg-zinc-100 text-zinc-500",
};

const Usage = ({ label, used, max }: { label: string; used: number; max: number }) => {
  const pct = max === -1 ? 0 : Math.min(100, (used / Math.max(max, 1)) * 100);
  return (
    <div>
      <div className="flex justify-between text-xs text-zinc-500">
        <span>{label}</span>
        <span>
          {used} / {formatLimit(max)}
        </span>
      </div>
      {max !== -1 && (
        <div className="mt-1 h-1.5 w-full rounded-full bg-zinc-100">
          <div
            className={`h-1.5 rounded-full ${pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-500" : "bg-emerald-500"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  );
};

export default function PlanSettingsForm({
  canManagePlan,
  currentPlan,
  allPlans,
  usage,
}: {
  canManagePlan: boolean;
  currentPlan: CurrentPlan | null;
  allPlans: PlanOption[];
  usage: { stores: number; users: number; products: number };
}) {
  const [requests, setRequests] = useState<PlanChangeRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCode, setSelectedCode] = useState("");
  const [billingCycle, setBillingCycle] = useState<"MONTHLY" | "YEARLY">(currentPlan?.billingCycle ?? "MONTHLY");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    setLoading(true);
    const res = await fetch("/api/plan-requests");
    const data = await res.json();
    setRequests(Array.isArray(data) ? data : []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const hasPending = requests.some((r) => r.status === "PENDING" || r.status === "CONTACTED");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (!selectedCode) {
      setError("Choose a plan first.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/plan-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestedPlanCode: selectedCode, billingCycle, note: note || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to submit request.");
        return;
      }
      setSuccess("Request sent! We'll reach out to arrange payment, then activate your new plan.");
      setSelectedCode("");
      setNote("");
      load();
    } catch {
      setError("Network error.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!currentPlan) return <p className="text-sm text-zinc-400">No active subscription found.</p>;

  return (
    <div className="max-w-2xl space-y-6">
      <div className="rounded-2xl border border-zinc-200 bg-white p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-zinc-500">Current plan</p>
            <p className="mt-1 text-xl font-bold text-zinc-900">{currentPlan.name}</p>
          </div>
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              currentPlan.status === "TRIALING" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"
            }`}
          >
            {currentPlan.status === "TRIALING" ? "Free trial" : currentPlan.status}
          </span>
        </div>
        <p className="mt-1 text-xs text-zinc-500">
          {currentPlan.status === "TRIALING" && currentPlan.trialEndsAt
            ? `Trial ends ${formatDate(currentPlan.trialEndsAt)}`
            : currentPlan.currentPeriodEnd
            ? `Renews ${formatDate(currentPlan.currentPeriodEnd)}`
            : null}
        </p>

        <div className="mt-5 space-y-3">
          <Usage label="Branches" used={usage.stores} max={currentPlan.maxStores} />
          <Usage label="Staff accounts" used={usage.users} max={currentPlan.maxUsers} />
          <Usage label="Products" used={usage.products} max={currentPlan.maxProducts} />
        </div>
      </div>

      {canManagePlan && (
        <div className="rounded-2xl border border-zinc-200 bg-white p-6">
          <h3 className="font-semibold text-zinc-900">Change plan</h3>
          <p className="mt-1 text-sm text-zinc-500">
            Nookly doesn&apos;t charge cards automatically. Submit a request, we&apos;ll contact you to arrange
            payment, and we&apos;ll activate the new plan as soon as it&apos;s confirmed.
          </p>

          {hasPending ? (
            <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-700">
              You already have a pending request — we&apos;ll be in touch soon.
            </p>
          ) : (
            <form onSubmit={submit} className="mt-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <select
                  value={selectedCode}
                  onChange={(e) => setSelectedCode(e.target.value)}
                  className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                >
                  <option value="">Select a plan...</option>
                  {allPlans
                    .filter((p) => p.code !== currentPlan.code)
                    .map((p) => (
                      <option key={p.code} value={p.code}>
                        {p.name} — {peso(billingCycle === "YEARLY" ? p.priceYearly / 12 : p.priceMonthly)}/mo
                      </option>
                    ))}
                </select>
                <select
                  value={billingCycle}
                  onChange={(e) => setBillingCycle(e.target.value as "MONTHLY" | "YEARLY")}
                  className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                >
                  <option value="MONTHLY">Monthly</option>
                  <option value="YEARLY">Yearly (2 months free)</option>
                </select>
              </div>
              <input
                placeholder="Anything we should know? (optional)"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
              />
              {error && <p className="text-sm text-red-600">{error}</p>}
              {success && <p className="text-sm text-emerald-600">{success}</p>}
              <button
                type="submit"
                disabled={submitting}
                className="rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
              >
                {submitting ? "Sending..." : "Request plan change"}
              </button>
            </form>
          )}
        </div>
      )}

      {requests.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
          <div className="border-b border-zinc-100 px-4 py-3 text-sm font-semibold text-zinc-900">Request history</div>
          <table className="w-full text-sm">
            <tbody>
              {loading ? (
                <tr>
                  <td className="px-4 py-4 text-center text-zinc-400">Loading...</td>
                </tr>
              ) : (
                requests.map((r) => (
                  <tr key={r.id} className="border-b border-zinc-50 last:border-0">
                    <td className="px-4 py-3">
                      <p className="text-zinc-900">
                        {r.currentPlan.name} → {r.requestedPlan.name}
                      </p>
                      <p className="text-xs text-zinc-400">{formatDate(r.createdAt)}</p>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_TONE[r.status] ?? "bg-zinc-100 text-zinc-500"}`}>
                        {r.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
