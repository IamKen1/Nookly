import { requireActiveSession } from "@/lib/require-session";
import { prisma } from "@/lib/prisma";
import AppShell from "@/components/app/AppShell";
import InventoryClient from "@/components/inventory/InventoryClient";

export default async function InventoryPage() {
  const session = await requireActiveSession();

  const tenant = await prisma.tenant.findUnique({
    where: { id: session.tenantId },
    include: { subscription: { include: { plan: true } } },
  });
  if (!tenant) return null;

  return (
    <AppShell tenantName={tenant.name} planName={tenant.subscription?.plan.name} role={session.role}>
      <InventoryClient isOwner={session.role === "OWNER"} />
    </AppShell>
  );
}
