import { requirePagePermission } from "@/lib/require-session";
import { prisma } from "@/lib/prisma";
import AppShell from "@/components/app/AppShell";
import SupplierDetailClient from "@/components/suppliers/SupplierDetailClient";

export default async function SupplierPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePagePermission("suppliers");
  const { id } = await params;
  const tenant = await prisma.tenant.findUnique({
    where: { id: session.tenantId },
    include: { subscription: { include: { plan: true } } },
  });
  if (!tenant) return null;

  return (
    <AppShell tenantName={tenant.name} tenantId={tenant.id} planName={tenant.subscription?.plan.name} role={session.role}>
      <SupplierDetailClient supplierId={id} />
    </AppShell>
  );
}
