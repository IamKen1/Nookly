import { requirePagePermission } from "@/lib/require-session";
import { prisma } from "@/lib/prisma";
import { isReportKey } from "@/lib/reports/registry";
import { getBranchContext } from "@/lib/branch-scope";
import { getRolePermissions } from "@/lib/permissions";
import AppShell from "@/components/app/AppShell";
import ReportsClient from "@/components/reports/ReportsClient";

export default async function ReportsPage() {
  const session = await requirePagePermission("reports");

  const [tenant, branches, permissions] = await Promise.all([
    prisma.tenant.findUnique({
      where: { id: session.tenantId },
      include: { subscription: { include: { plan: true } } },
    }),
    getBranchContext(session),
    getRolePermissions(session.tenantId, session.role),
  ]);
  if (!tenant) return null;

  // Same as getEnabledReports(planCode), read off the plan row already loaded
  // with the tenant.
  const rawReports = tenant.subscription?.plan.enabledReports;
  const enabledReports = Array.isArray(rawReports) ? rawReports.filter(isReportKey) : [];
  // Payables are only for those who handle supplier payments.
  const visible = enabledReports.filter((k) => k !== "payables-aging" || permissions.suppliers_pay);

  return (
    <AppShell tenantName={tenant.name} tenantId={tenant.id} planName={tenant.subscription?.plan.name} role={session.role}>
      {visible.length > 0 ? (
        <ReportsClient
          enabledReports={visible}
          isMultiBranch={branches.isMultiBranch}
          branches={branches.isMultiBranch && permissions.all_branches ? branches.stores.map((s) => ({ id: s.id, name: s.name })) : null}
        />
      ) : (
        <div className="mx-auto max-w-lg rounded-2xl border border-zinc-200 bg-white p-8 text-center">
          <h1 className="text-xl font-bold text-zinc-900">Reports</h1>
          <p className="mt-2 text-sm text-zinc-500">Reports aren&apos;t included in your current plan. Upgrade to unlock them.</p>
        </div>
      )}
    </AppShell>
  );
}
