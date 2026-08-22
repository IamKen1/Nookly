"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Leaf, AlertTriangle, Check, Loader2 } from "lucide-react";
import { peso, formatDate } from "@/lib/format";

interface Lapse {
  reason: "trial_expired" | "renewal_expired" | "canceled";
  planName: string;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
}

interface PlanOption {
  code: string;
  name: string;
  tagline: string | null;
  priceMonthly: number;
  priceYearly: number;
  features: string[];
}

interface PlanChangeRequest {
  id: string;
  status: string;
  requestedPlan: { name: string };
}

const REASON_COPY: Record<Lapse["reason"], { title: string; body: string }> = {
  trial_expired: {
    title: "Your free trial has ended",
    body: "Pick a plan below and we'll get you back up and running as soon as your payment is confirmed.",
  },
  renewal_expired: {
    title: "Your subscription needs renewal",
    body: "Your last billing period has ended. Request a renewal below and we'll confirm it once payment is arranged.",
  },
  canceled: {
    title: "Your subscription was canceled",
    body: "Choose a plan below to reactivate your workspace.",
  },
};

export default function UpgradeClient({
  lapse,
  canRequest,
  allPlans,
}: {
  lapse: Lapse | null;
  canRequest: boolean;
  allPlans: PlanOption[];
}) {
  const router = useRouter();
  const [requests, setRequests] = useState<PlanChangeRequest[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(true);
  const [billingCycle, setBillingCycle] = useState<"MONTHLY" | "YEARLY">("MONTHLY");
  const [submittingCode, setSubmittingCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    fetch("/api/plan-requests")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setRequests(Array.isArray(data) ? data : []))
      .catch(() => setRequests([]))
      .finally(() => setLoadingRequests(false));
  }, []);

  const hasPending = requests.some((r) => r.status === "PENDING" || r.status === "CONTACTED");

  const submit = async (code: string) => {
    setError(null);
    setSuccess(null);
    setSubmittingCode(code);
    try {
      const res = await fetch("/api/plan-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestedPlanCode: code, billingCycle }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to submit request.");
        return;
      }
      setSuccess("Request sent! We'll reach out to arrange payment, then activate your plan.");
      setRequests((prev) => [data, ...prev]);
    } catch {
      setError("Network error.");
    } finally {
      setSubmittingCode(null);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 px-6 py-12">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-zinc-900">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm">
              <Leaf className="h-5 w-5" />
            </span>
            <span className="text-lg">Nookly</span>
          </div>
          <button
            onClick={async () => {
              setLoggingOut(true);
              try {
                await fetch("/api/auth/logout", { method: "POST" });
                router.push("/login");
                router.refresh();
              } finally {
                setLoggingOut(false);
              }
            }}
            disabled={loggingOut}
            className="btn-press flex items-center justify-center gap-2 text-sm font-medium text-zinc-500 hover:text-zinc-900 disabled:opacity-60"
          >
            {loggingOut && <Loader2 className="h-4 w-4 animate-spin" />}
            Log out
          </button>
        </div>

        {lapse && (
          <div className="mb-8 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-5">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div>
              <h1 className="font-semibold text-amber-900">{REASON_COPY[lapse.reason].title}</h1>
              <p className="mt-1 text-sm text-amber-700">{REASON_COPY[lapse.reason].body}</p>
            </div>
          </div>
        )}

        {!lapse && (
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-zinc-900">Upgrade your plan</h1>
            <p className="mt-1 text-sm text-zinc-500">Pick a plan and we&apos;ll reach out to arrange payment.</p>
          </div>
        )}

        {!canRequest && (
          <p className="mb-6 rounded-lg bg-zinc-100 px-4 py-3 text-sm text-zinc-600">
            Only the workspace owner or an admin can request a plan change — ask them to sign in and pick a plan here.
          </p>
        )}

        {canRequest && !loadingRequests && hasPending && (
          <p className="mb-6 rounded-lg bg-blue-50 px-4 py-3 text-sm text-blue-700">
            You already have a pending request for the{" "}
            {requests.find((r) => r.status === "PENDING" || r.status === "CONTACTED")?.requestedPlan.name} plan — we&apos;ll be in touch soon.
          </p>
        )}

        {canRequest && (
          <div className="mb-6 flex justify-center gap-2">
            <button
              onClick={() => setBillingCycle("MONTHLY")}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold ${
                billingCycle === "MONTHLY" ? "bg-emerald-600 text-white" : "border border-zinc-300 text-zinc-600"
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setBillingCycle("YEARLY")}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold ${
                billingCycle === "YEARLY" ? "bg-emerald-600 text-white" : "border border-zinc-300 text-zinc-600"
              }`}
            >
              Yearly (2 months free)
            </button>
          </div>
        )}

        {error && <p className="mb-4 text-center text-sm text-red-600">{error}</p>}
        {success && <p className="mb-4 text-center text-sm text-emerald-600">{success}</p>}

        <div className="grid gap-4 sm:grid-cols-3">
          {allPlans.map((p) => (
            <div key={p.code} className="flex flex-col rounded-2xl border border-zinc-200 bg-white p-6">
              <h3 className="text-lg font-bold text-zinc-900">{p.name}</h3>
              {p.tagline && <p className="mt-1 text-xs text-zinc-500">{p.tagline}</p>}
              <p className="mt-4 text-2xl font-bold text-zinc-900">
                {peso(billingCycle === "YEARLY" ? p.priceYearly / 12 : p.priceMonthly)}
                <span className="text-sm font-normal text-zinc-400">/mo</span>
              </p>
              <ul className="mt-4 flex-1 space-y-2 text-sm text-zinc-600">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    {f}
                  </li>
                ))}
              </ul>
              {canRequest && (
                <button
                  onClick={() => submit(p.code)}
                  disabled={submittingCode !== null || hasPending}
                  className="btn-press mt-5 flex items-center justify-center gap-2 rounded-full bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                >
                  {submittingCode === p.code && <Loader2 className="h-4 w-4 animate-spin" />}
                  {submittingCode === p.code ? "Sending..." : "Request this plan"}
                </button>
              )}
            </div>
          ))}
        </div>

        {lapse?.trialEndsAt && (
          <p className="mt-8 text-center text-xs text-zinc-400">Trial ended {formatDate(lapse.trialEndsAt)}</p>
        )}
        {lapse?.currentPeriodEnd && (
          <p className="mt-8 text-center text-xs text-zinc-400">Last period ended {formatDate(lapse.currentPeriodEnd)}</p>
        )}
      </div>
    </div>
  );
}
