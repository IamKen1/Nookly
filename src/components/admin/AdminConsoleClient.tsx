"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LayoutDashboard, LogOut, ShieldCheck } from "lucide-react";
import OverviewTab from "./OverviewTab";
import AnalyticsTab from "./AnalyticsTab";
import TenantsTab from "./TenantsTab";
import PlansTab from "./PlansTab";
import PlanRequestsTab from "./PlanRequestsTab";
import AdminsTab from "./AdminsTab";
import AuditLogTab from "./AuditLogTab";
import SupportTab from "./SupportTab";
import GfpMigrationTab from "./GfpMigrationTab";

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "analytics", label: "Analytics" },
  { key: "tenants", label: "Tenants" },
  { key: "support", label: "Support" },
  { key: "plans", label: "Plans" },
  { key: "plan-requests", label: "Plan requests" },
  { key: "gfp-migration", label: "GFP Migration" },
  { key: "admins", label: "Admins" },
  { key: "audit-log", label: "Audit log" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function AdminConsoleClient({ adminEmail }: { adminEmail: string }) {
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>("overview");
  const [locking, setLocking] = useState(false);

  const handleLock = async () => {
    setLocking(true);
    try {
      await fetch("/api/nk-ops-72fq9/lock", { method: "POST" });
      router.push("/nk-ops-72fq9/unlock");
      router.refresh();
    } finally {
      setLocking(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-500/10 text-red-400">
              <ShieldCheck className="h-4.5 w-4.5" />
            </span>
            <div>
              <h1 className="text-sm font-semibold text-white">Nookly Ops Console</h1>
              <p className="text-xs text-zinc-500">{adminEmail}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="/dashboard"
              className="flex items-center gap-1.5 rounded-full border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:border-zinc-500"
            >
              <LayoutDashboard className="h-3.5 w-3.5" />
              Back to app
            </a>
            <button
              onClick={handleLock}
              disabled={locking}
              className="flex items-center gap-1.5 rounded-full border border-red-800 px-3 py-1.5 text-xs font-medium text-red-400 hover:border-red-600 disabled:opacity-50"
            >
              <LogOut className="h-3.5 w-3.5" />
              Lock console
            </button>
          </div>
        </div>
      </header>

      <div className="px-6 py-6">
        <nav className="mb-6 flex gap-1 border-b border-zinc-800">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`border-b-2 px-4 py-2.5 text-sm font-medium transition ${
                tab === t.key ? "border-red-500 text-white" : "border-transparent text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>

        {tab === "overview" && <OverviewTab />}
        {tab === "analytics" && <AnalyticsTab />}
        {tab === "tenants" && <TenantsTab />}
        {tab === "support" && <SupportTab adminEmail={adminEmail} />}
        {tab === "plans" && <PlansTab />}
        {tab === "plan-requests" && <PlanRequestsTab />}
        {tab === "gfp-migration" && <GfpMigrationTab />}
        {tab === "admins" && <AdminsTab currentAdminEmail={adminEmail} />}
        {tab === "audit-log" && <AuditLogTab />}
      </div>
    </div>
  );
}
