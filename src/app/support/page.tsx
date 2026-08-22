import { requireSession } from "@/lib/require-session";
import { prisma } from "@/lib/prisma";
import AppShell from "@/components/app/AppShell";
import SupportClient from "@/components/support/SupportClient";

export default async function SupportPage() {
  const session = await requireSession();

  const tenant = await prisma.tenant.findUnique({
    where: { id: session.tenantId },
    include: { subscription: { include: { plan: true } } },
  });
  if (!tenant) return null;

  return (
    <AppShell tenantName={tenant.name} tenantId={tenant.id} planName={tenant.subscription?.plan.name} role={session.role}>
      <SupportClient />
    </AppShell>
  );
}
