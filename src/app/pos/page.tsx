import { requirePagePermission } from "@/lib/require-session";
import { prisma } from "@/lib/prisma";
import { staffCodeRequired } from "@/lib/staff-code";
import { getRolePermissions } from "@/lib/permissions";
import { branchHasOrderSenders, canManageAllBranches, getBranchContext, rolesThatSendOrders } from "@/lib/branch-scope";
import { getTenantPlanCode, hasFeature } from "@/lib/plan-gating";
import PosClient from "@/components/pos/PosClient";

export default async function PosPage() {
  const session = await requirePagePermission("pos");

  const tenant = await prisma.tenant.findUnique({
    where: { id: session.tenantId },
    include: { subscription: { include: { plan: true } } },
  });

  if (!tenant) return null;

  const [categories, permissions, branchContext, pollOrders, canRecordPrescriptions, senderRoles, requireStaffCode, branchStaff] = await Promise.all([
    prisma.category.findMany({
      where: { tenantId: session.tenantId, isActive: true },
      orderBy: { name: "asc" },
    }),
    getRolePermissions(session.tenantId, session.role),
    getBranchContext(session),
    branchHasOrderSenders(session.tenantId, session.storeId),
    getTenantPlanCode(session.tenantId).then((code) => hasFeature(code, "prescriptions")),
    rolesThatSendOrders(session.tenantId),
    staffCodeRequired(session.tenantId),
    session.storeId ? prisma.user.count({ where: { tenantId: session.tenantId, storeId: session.storeId, isActive: true } }) : 0,
  ]);
  // The owner may send orders too, but only gets the button once the workspace uses orders.
  const canSendToCashier = session.role === "OWNER" ? senderRoles.length > 0 : permissions.pos_send_to_cashier;
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
      pollOrders={pollOrders}
      pollStock={branchStaff > 1}
      canSendToCashier={canSendToCashier}
      canRecordPrescriptions={canRecordPrescriptions}
      requireStaffCode={requireStaffCode}
      categories={categories.map((c) => ({ id: c.id, name: c.name }))}
    />
  );
}
