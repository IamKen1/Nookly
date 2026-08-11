import { requireSession } from "@/lib/require-session";
import { prisma } from "@/lib/prisma";
import { hasFeature, upgradeMessage, type PlanCode } from "@/lib/plan-gating";
import AppShell from "@/components/app/AppShell";
import PrescriptionsClient from "@/components/prescriptions/PrescriptionsClient";

export default async function PrescriptionsPage() {
  const session = await requireSession();

  const tenant = await prisma.tenant.findUnique({
    where: { id: session.tenantId },
    include: { subscription: { include: { plan: true } } },
  });
  if (!tenant) return null;

  const planCode = tenant.subscription?.plan.code as PlanCode | undefined;
  const canViewPrescriptions = await hasFeature(planCode, "prescriptions");

  return (
    <AppShell tenantName={tenant.name} planName={tenant.subscription?.plan.name} role={session.role}>
      {canViewPrescriptions ? (
        <PrescriptionsClient />
      ) : (
        <div className="mx-auto max-w-lg rounded-2xl border border-zinc-200 bg-white p-8 text-center">
          <h1 className="text-xl font-bold text-zinc-900">Prescriptions</h1>
          <p className="mt-2 text-sm text-zinc-500">{upgradeMessage("prescriptions")}</p>
        </div>
      )}
    </AppShell>
  );
}
