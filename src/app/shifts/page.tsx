import { redirect } from "next/navigation";
import { requireActiveSession } from "@/lib/require-session";
import { prisma } from "@/lib/prisma";
import AppShell from "@/components/app/AppShell";
import ShiftsClient from "@/components/shifts/ShiftsClient";

const SUPERVISOR_ROLES = ["OWNER", "ADMIN", "MANAGER"];

export default async function ShiftsPage() {
  const session = await requireActiveSession();
  if (!SUPERVISOR_ROLES.includes(session.role)) redirect("/dashboard");

  const tenant = await prisma.tenant.findUnique({
    where: { id: session.tenantId },
    include: { subscription: { include: { plan: true } } },
  });
  if (!tenant) return null;

  return (
    <AppShell tenantName={tenant.name} planName={tenant.subscription?.plan.name} role={session.role}>
      <ShiftsClient />
    </AppShell>
  );
}
