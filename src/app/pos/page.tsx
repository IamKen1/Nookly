import { requireActiveSession } from "@/lib/require-session";
import { prisma } from "@/lib/prisma";
import { getRolePermissions } from "@/lib/permissions";
import PosClient from "@/components/pos/PosClient";

export default async function PosPage() {
  const session = await requireActiveSession();

  const tenant = await prisma.tenant.findUnique({
    where: { id: session.tenantId },
    include: { subscription: { include: { plan: true } } },
  });

  if (!tenant) return null;

  const [categories, permissions] = await Promise.all([
    prisma.category.findMany({
      where: { tenantId: session.tenantId, isActive: true },
      orderBy: { name: "asc" },
    }),
    getRolePermissions(session.tenantId, session.role),
  ]);

  return (
    <PosClient
      tenantName={tenant.name}
      planName={tenant.subscription?.plan.name}
      role={session.role}
      permissions={permissions}
      categories={categories.map((c) => ({ id: c.id, name: c.name }))}
    />
  );
}
