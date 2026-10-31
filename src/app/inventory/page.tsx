import { requirePagePermission } from "@/lib/require-session";
import { prisma } from "@/lib/prisma";
import { canManageAllBranches, getBranchContext } from "@/lib/branch-scope";
import { hasPermission } from "@/lib/permissions";
import { hasFeature, type PlanCode } from "@/lib/plan-gating";
import AppShell from "@/components/app/AppShell";
import InventoryClient from "@/components/inventory/InventoryClient";

export default async function InventoryPage() {
  const session = await requirePagePermission("inventory");

  const tenant = await prisma.tenant.findUnique({
    where: { id: session.tenantId },
    include: { subscription: { include: { plan: true } } },
  });
  if (!tenant) return null;

  const branchContext = await getBranchContext(session);
  const canTransfer =
    branchContext.isMultiBranch &&
    (await hasFeature(tenant.subscription?.plan.code as PlanCode | undefined, "multiBranch")) &&
    (await hasPermission(session.tenantId, session.role, "inventory_adjust"));

  return (
    <AppShell tenantName={tenant.name} tenantId={tenant.id} planName={tenant.subscription?.plan.name} role={session.role}>
      <InventoryClient
        isOwner={session.role === "OWNER"}
        canAdjust={await hasPermission(session.tenantId, session.role, "inventory_adjust")}
        branches={
          branchContext.isMultiBranch
            ? { stores: branchContext.stores.map((s) => ({ id: s.id, name: s.name })), currentStoreId: session.storeId, canTransfer, canSetPrices: canManageAllBranches(session.role) }
            : undefined
        }
      />
    </AppShell>
  );
}
