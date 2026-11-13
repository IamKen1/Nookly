import { requirePagePermission } from "@/lib/require-session";
import { prisma } from "@/lib/prisma";
import { upgradeMessage } from "@/lib/plan-gating";
import { hasPermission } from "@/lib/permissions";
import AppShell from "@/components/app/AppShell";
import PrescriptionsClient from "@/components/prescriptions/PrescriptionsClient";

export default async function PrescriptionsPage() {
  const session = await requirePagePermission("prescriptions");

  const [tenant, canReorder] = await Promise.all([
    prisma.tenant.findUnique({
      where: { id: session.tenantId },
      include: { subscription: { include: { plan: true } } },
    }),
    hasPermission(session.tenantId, session.role, "pos"),
  ]);
  if (!tenant) return null;

  // The prescriptions flag is read off the plan row already loaded with the tenant.
  const canViewPrescriptions = Boolean(tenant.subscription?.plan.featurePrescriptions);

  return (
    <AppShell tenantName={tenant.name} tenantId={tenant.id} planName={tenant.subscription?.plan.name} role={session.role}>
      {canViewPrescriptions ? (
        <PrescriptionsClient canReorder={canReorder} />
      ) : (
        <div className="mx-auto max-w-lg rounded-2xl border border-zinc-200 bg-white p-8 text-center">
          <h1 className="text-xl font-bold text-zinc-900">Prescriptions</h1>
          <p className="mt-2 text-sm text-zinc-500">{upgradeMessage("prescriptions")}</p>
        </div>
      )}
    </AppShell>
  );
}
