import { requirePagePermission } from "@/lib/require-session";
import { prisma } from "@/lib/prisma";
import { canManageAllBranches, getBranchContext } from "@/lib/branch-scope";
import { hasPermission } from "@/lib/permissions";
import AppShell from "@/components/app/AppShell";
import InventoryClient from "@/components/inventory/InventoryClient";

// `?tab=receiving|batches|movements|branches` opens that tab directly (e.g. from the
// dashboard's expiring or stock-request links).
export default async function InventoryPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const session = await requirePagePermission("inventory");
  const { tab } = await searchParams;

  const [tenant, branchContext, canPaySuppliers, canAdjust] = await Promise.all([
    prisma.tenant.findUnique({
      where: { id: session.tenantId },
      include: { subscription: { include: { plan: true } } },
    }),
    getBranchContext(session),
    hasPermission(session.tenantId, session.role, "suppliers_pay"),
    hasPermission(session.tenantId, session.role, "inventory_adjust"),
  ]);
  if (!tenant) return null;

  // The multi-branch flag is read off the plan row already loaded with the tenant.
  const canTransfer = branchContext.isMultiBranch && Boolean(tenant.subscription?.plan.featureMultiBranch) && canAdjust;

  return (
    <AppShell tenantName={tenant.name} tenantId={tenant.id} planName={tenant.subscription?.plan.name} role={session.role}>
      <InventoryClient
        isOwner={session.role === "OWNER"}
        initialTab={tab}
        canSeeAllBranches={branchContext.isMultiBranch && canManageAllBranches(session.role)}
        canPaySuppliers={canPaySuppliers}
        canAdjust={canAdjust}
        branches={
          branchContext.isMultiBranch
            ? { stores: branchContext.stores.map((s) => ({ id: s.id, name: s.name })), currentStoreId: session.storeId, canTransfer, canSetPrices: canManageAllBranches(session.role) }
            : undefined
        }
      />
    </AppShell>
  );
}
