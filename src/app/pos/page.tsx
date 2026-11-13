import { requirePagePermission } from "@/lib/require-session";
import { prisma } from "@/lib/prisma";
import { staffCodeRequired } from "@/lib/staff-code";
import { getRolePermissions } from "@/lib/permissions";
import { canManageAllBranches, getBranchContext, rolesThatSendOrders } from "@/lib/branch-scope";
import PosClient from "@/components/pos/PosClient";

export default async function PosPage() {
  const session = await requirePagePermission("pos");

  // Read once and shared: who sends orders decides both the owner's button and
  // whether this branch polls for waiting orders.
  const senderRolesP = rolesThatSendOrders(session.tenantId);
  const storeId = session.storeId;
  const [tenant, categories, permissions, branchContext, pollOrders, senderRoles, branchStaff] = await Promise.all([
    prisma.tenant.findUnique({
      where: { id: session.tenantId },
      include: { subscription: { include: { plan: true } } },
    }),
    prisma.category.findMany({
      where: { tenantId: session.tenantId, isActive: true },
      orderBy: { name: "asc" },
    }),
    getRolePermissions(session.tenantId, session.role),
    getBranchContext(session),
    // Same as branchHasOrderSenders(), reusing the sender roles read above.
    storeId
      ? senderRolesP.then(async (roles) =>
          roles.length === 0
            ? false
            : (await prisma.user.count({ where: { tenantId: session.tenantId, storeId, role: { in: roles as never[] }, isActive: true } })) > 0
        )
      : false,
    senderRolesP,
    storeId ? prisma.user.count({ where: { tenantId: session.tenantId, storeId, isActive: true } }) : 0,
  ]);

  if (!tenant) return null;

  // The plan's flags come from the plan row already loaded with the tenant; the
  // active-branch count from the branch list.
  const plan = tenant.subscription?.plan;
  const canRecordPrescriptions = Boolean(plan?.featurePrescriptions);
  const requireStaffCode = await staffCodeRequired(session.tenantId, {
    requireStaffCode: tenant.requireStaffCode,
    plan,
    activeBranches: branchContext.stores.length,
  });
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
