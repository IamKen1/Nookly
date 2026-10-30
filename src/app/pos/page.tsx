import { requireActiveSession } from "@/lib/require-session";
import { prisma } from "@/lib/prisma";
import { getRolePermissions } from "@/lib/permissions";
import { canManageAllBranches, getBranchContext } from "@/lib/branch-scope";
import PosClient from "@/components/pos/PosClient";

export default async function PosPage() {
  const session = await requireActiveSession();

  const tenant = await prisma.tenant.findUnique({
    where: { id: session.tenantId },
    include: { subscription: { include: { plan: true } } },
  });

  if (!tenant) return null;

  const [categories, permissions, branchContext] = await Promise.all([
    prisma.category.findMany({
      where: { tenantId: session.tenantId, isActive: true },
      orderBy: { name: "asc" },
    }),
    getRolePermissions(session.tenantId, session.role),
    getBranchContext(session),
  ]);
  const branches = branchContext.isMultiBranch
    ? {
        currentStoreId: session.storeId,
        currentName: branchContext.current?.name ?? "No branch",
        // Owners/admins get a switcher; everyone else just sees which branch they're in.
        switchable: canManageAllBranches(session.role) ? branchContext.stores.map((s) => ({ id: s.id, name: s.name })) : null,
      }
    : undefined;

  return (
    <PosClient
      tenantName={tenant.name}
      planName={tenant.subscription?.plan.name}
      role={session.role}
      permissions={permissions}
      branches={branches}
      categories={categories.map((c) => ({ id: c.id, name: c.name }))}
    />
  );
}
