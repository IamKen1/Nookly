"use client";

import { useState } from "react";
import { BadgePercent, Bell, CreditCard, KeyRound, Loader2, PlayCircle, ReceiptText, ShieldCheck, Store, type LucideIcon } from "lucide-react";
import ReceiptSettingsForm from "./ReceiptSettingsForm";
import NotificationSettingsForm from "./NotificationSettingsForm";
import PlanSettingsForm from "./PlanSettingsForm";
import UserAccessForm from "./UserAccessForm";
import ApiKeysForm from "./ApiKeysForm";
import BranchesForm from "./BranchesForm";
import DiscountsForm from "./DiscountsForm";

type Tab = "plan" | "branches" | "discounts" | "receipt" | "notifications" | "userAccess" | "apiAccess";

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
  canManageApiAccess,
  isOwner,
  currentPlan,
  allPlans,
  usage,
}: {
  canManageAlerts: boolean;
  canManagePlan: boolean;
  canManageApiAccess: boolean;
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

  const sections: { key: Tab; label: string; description: string; icon: LucideIcon; visible: boolean }[] = [
    { key: "plan", label: "Plan & billing", description: "Your subscription, usage, and plan changes", icon: CreditCard, visible: true },
    {
      key: "branches",
      label: "Branches",
      description: "Add and rename your store branches",
      icon: Store,
      visible: canManagePlan && Boolean(currentPlan),
    },
    { key: "discounts", label: "Discounts", description: "Discounts the counter can give at checkout", icon: BadgePercent, visible: true },
    { key: "receipt", label: "Receipt", description: "Store details and what prints on receipts", icon: ReceiptText, visible: true },
    { key: "notifications", label: "Notifications", description: "Email alerts for sales and stock", icon: Bell, visible: canManageAlerts },
    { key: "userAccess", label: "User access", description: "What each staff role can do", icon: ShieldCheck, visible: isOwner },
    { key: "apiAccess", label: "API access", description: "Keys for connecting other systems", icon: KeyRound, visible: canManageApiAccess },
  ];
  const visibleSections = sections.filter((s) => s.visible);
  const active = visibleSections.find((s) => s.key === tab) ?? visibleSections[0];

  return (
    <div className="w-full max-w-[calc(100vw-3rem)] lg:mx-auto sm:max-w-[calc(100vw-17rem)] lg:max-w-6xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Settings</h1>
          <p className="mt-1 text-sm text-zinc-500">Manage your plan, branches, discounts, receipts, and alert preferences.</p>
        </div>
        <button
          onClick={restartTour}
          disabled={restarting}
          className="flex items-center justify-center gap-2 rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 shadow-sm hover:border-zinc-300 disabled:opacity-50 btn-press"
        >
          {restarting ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4 text-emerald-600" />}
          {restarting ? "Starting..." : "Replay guided tour"}
        </button>
      </div>

      <div className="mt-8 flex flex-col gap-8 lg:flex-row lg:items-start">
        <nav className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 lg:sticky lg:top-6 lg:mx-0 lg:w-64 lg:shrink-0 lg:flex-col lg:gap-1 lg:overflow-visible lg:px-0">
          {visibleSections.map(({ key, label, description, icon: Icon }) => {
            const selected = active.key === key;
            return (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`flex shrink-0 items-start gap-3 rounded-xl px-3.5 py-2.5 text-left transition lg:w-full lg:py-3 ${
                  selected
                    ? "bg-white shadow-sm ring-1 ring-emerald-200"
                    : "border border-zinc-200 bg-white lg:border-transparent lg:bg-transparent hover:bg-white"
                }`}
              >
                <span
                  className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                    selected ? "bg-emerald-600 text-white" : "bg-zinc-100 text-zinc-500"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className={`block whitespace-nowrap text-sm font-semibold ${selected ? "text-emerald-700" : "text-zinc-800"}`}>{label}</span>
                  <span className="hidden text-xs leading-snug text-zinc-500 lg:block">{description}</span>
                </span>
              </button>
            );
          })}
        </nav>

        <section className={`min-w-0 flex-1 ${tab === "userAccess" ? "" : "lg:max-w-4xl"}`}>
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-zinc-900">{active.label}</h2>
            <p className="mt-1 text-sm text-zinc-500">{active.description}</p>
          </div>
          {active.key === "plan" && (
            <PlanSettingsForm canManagePlan={canManagePlan} currentPlan={currentPlan} allPlans={allPlans} usage={usage} />
          )}
          {active.key === "branches" && canManagePlan && currentPlan && (
            <BranchesForm maxStores={currentPlan.maxStores} planName={currentPlan.name} />
          )}
          {active.key === "discounts" && <DiscountsForm />}
          {active.key === "receipt" && <ReceiptSettingsForm />}
          {active.key === "notifications" && canManageAlerts && <NotificationSettingsForm />}
          {active.key === "userAccess" && isOwner && <UserAccessForm />}
          {active.key === "apiAccess" && canManageApiAccess && <ApiKeysForm />}
        </section>
      </div>
    </div>
  );
}
