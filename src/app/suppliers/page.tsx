import { requirePagePermission } from "@/lib/require-session";
import { prisma } from "@/lib/prisma";
import AppShell from "@/components/app/AppShell";
import SuppliersClient from "@/components/suppliers/SuppliersClient";

export default async function SuppliersPage() {
  const session = await requirePagePermission("suppliers");
  const tenant = await prisma.tenant.findUnique({
    where: { id: session.tenantId },
    include: { subscription: { include: { plan: true } } },
  });
  if (!tenant) return null;

  return (
    <AppShell tenantName={tenant.name} tenantId={tenant.id} planName={tenant.subscription?.plan.name} role={session.role}>
      <SuppliersClient />
    </AppShell>
  );
}
