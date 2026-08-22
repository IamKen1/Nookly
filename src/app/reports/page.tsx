import { requireActiveSession } from "@/lib/require-session";
import { prisma } from "@/lib/prisma";
import { hasFeature, upgradeMessage, type PlanCode } from "@/lib/plan-gating";
import AppShell from "@/components/app/AppShell";
import ReportsClient from "@/components/reports/ReportsClient";

export default async function ReportsPage() {
  const session = await requireActiveSession();

  const tenant = await prisma.tenant.findUnique({
    where: { id: session.tenantId },
    include: { subscription: { include: { plan: true } } },
  });
  if (!tenant) return null;

  const planCode = tenant.subscription?.plan.code as PlanCode | undefined;
  const canViewReports = await hasFeature(planCode, "reports");

  return (
    <AppShell tenantName={tenant.name} tenantId={tenant.id} planName={tenant.subscription?.plan.name} role={session.role}>
      {canViewReports ? (
        <ReportsClient />
      ) : (
        <div className="mx-auto max-w-lg rounded-2xl border border-zinc-200 bg-white p-8 text-center">
          <h1 className="text-xl font-bold text-zinc-900">Reports</h1>
          <p className="mt-2 text-sm text-zinc-500">{upgradeMessage("reports")}</p>
        </div>
      )}
    </AppShell>
  );
}
