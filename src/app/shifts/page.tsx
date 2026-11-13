import { redirect } from "next/navigation";
import { requireActiveSession } from "@/lib/require-session";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/permissions";
import AppShell from "@/components/app/AppShell";
import ShiftsClient from "@/components/shifts/ShiftsClient";

export default async function ShiftsPage() {
  const session = await requireActiveSession();
  const [allowed, tenant] = await Promise.all([
    hasPermission(session.tenantId, session.role, "shifts"),
    prisma.tenant.findUnique({
      where: { id: session.tenantId },
      include: { subscription: { include: { plan: true } } },
    }),
  ]);
  if (!allowed) redirect("/dashboard");
  if (!tenant) return null;

  return (
    <AppShell tenantName={tenant.name} tenantId={tenant.id} planName={tenant.subscription?.plan.name} role={session.role}>
      <ShiftsClient />
    </AppShell>
  );
}
