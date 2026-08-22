"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import ReceiptSettingsForm from "./ReceiptSettingsForm";
import NotificationSettingsForm from "./NotificationSettingsForm";
import PlanSettingsForm from "./PlanSettingsForm";
import UserAccessForm from "./UserAccessForm";

type Tab = "plan" | "receipt" | "notifications" | "userAccess";

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

export default function SettingsClient({
  canManageAlerts,
  canManagePlan,
  isOwner,
  currentPlan,
  allPlans,
  usage,
}: {
  canManageAlerts: boolean;
  canManagePlan: boolean;
  isOwner: boolean;
  currentPlan: CurrentPlan | null;
  allPlans: PlanOption[];
  usage: { stores: number; users: number; products: number };
}) {
  const [tab, setTab] = useState<Tab>("plan");
  const [restarting, setRestarting] = useState(false);

  const restartTour = async () => {
    setRestarting(true);
    try {
      await fetch("/api/onboarding/tour", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reset: true }),
      });
      window.location.href = "/dashboard";
    } finally {
      setRestarting(false);
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Settings</h1>
          <p className="mt-1 text-sm text-zinc-500">Manage your plan, receipts, and alert preferences.</p>
        </div>
        <button
          onClick={restartTour}
          disabled={restarting}
          className="flex items-center justify-center gap-2 rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:border-zinc-400 disabled:opacity-50 btn-press"
        >
          {restarting && <Loader2 className="h-4 w-4 animate-spin" />}
          {restarting ? "Starting..." : "Replay guided tour"}
        </button>
      </div>

      <div className="mt-6 flex gap-2 border-b border-zinc-200">
        <button
          onClick={() => setTab("plan")}
          className={`px-4 py-2 text-sm font-semibold ${tab === "plan" ? "border-b-2 border-emerald-600 text-emerald-700" : "text-zinc-500 hover:text-zinc-700"}`}
        >
          Plan
        </button>
        <button
          onClick={() => setTab("receipt")}
          className={`px-4 py-2 text-sm font-semibold ${tab === "receipt" ? "border-b-2 border-emerald-600 text-emerald-700" : "text-zinc-500 hover:text-zinc-700"}`}
        >
          Receipt
        </button>
        {canManageAlerts && (
          <button
            onClick={() => setTab("notifications")}
            className={`px-4 py-2 text-sm font-semibold ${tab === "notifications" ? "border-b-2 border-emerald-600 text-emerald-700" : "text-zinc-500 hover:text-zinc-700"}`}
          >
            Notifications
          </button>
        )}
        {isOwner && (
          <button
            onClick={() => setTab("userAccess")}
            className={`px-4 py-2 text-sm font-semibold ${tab === "userAccess" ? "border-b-2 border-emerald-600 text-emerald-700" : "text-zinc-500 hover:text-zinc-700"}`}
          >
            User Access
          </button>
        )}
      </div>

      <div className="mt-6">
        {tab === "plan" && (
          <PlanSettingsForm canManagePlan={canManagePlan} currentPlan={currentPlan} allPlans={allPlans} usage={usage} />
        )}
        {tab === "receipt" && <ReceiptSettingsForm />}
        {tab === "notifications" && canManageAlerts && <NotificationSettingsForm />}
        {tab === "userAccess" && isOwner && <UserAccessForm />}
      </div>
    </div>
  );
}
