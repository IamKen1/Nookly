import { redirect } from "next/navigation";
import { requireActiveSession } from "@/lib/require-session";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/permissions";
import AppShell from "@/components/app/AppShell";
import ShiftsClient from "@/components/shifts/ShiftsClient";

export default async function ShiftsPage() {
  const session = await requireActiveSession();
  if (!(await hasPermission(session.tenantId, session.role, "shifts"))) redirect("/dashboard");

  const tenant = await prisma.tenant.findUnique({
    where: { id: session.tenantId },
    include: { subscription: { include: { plan: true } } },
  });
  if (!tenant) return null;

  return (
    <AppShell tenantName={tenant.name} tenantId={tenant.id} planName={tenant.subscription?.plan.name} role={session.role}>
      <ShiftsClient />
    </AppShell>
  );
}
