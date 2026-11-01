import { requirePagePermission } from "@/lib/require-session";
import { prisma } from "@/lib/prisma";
import { daysUntil } from "@/lib/plans";
import { formatDate } from "@/lib/format";
import { getBranchContext } from "@/lib/branch-scope";
import { ALL_ROLE_LABELS } from "@/lib/permissions-shared";
import { dashboardKindFor, getDashboardScope } from "@/lib/dashboard-data";
import AppShell from "@/components/app/AppShell";
import {
  CashierDashboard,
  ManagerDashboard,
  OrderTakerDashboard,
  OwnerDashboard,
  PharmacistDashboard,
  branchRowsFor,
  type HeroInfo,
} from "@/components/dashboard/views";

// One dashboard per kind of job: owners see the business, managers their
// branch today, pharmacists stock and prescriptions, cashiers their own shift.
// Every number respects the role's User Access (own sales / own branch).
export default async function DashboardPage() {
  const session = await requirePagePermission("dashboard");

  const [tenant, user, branchContext, scope] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: session.tenantId }, include: { subscription: { include: { plan: true } } } }),
    prisma.user.findUnique({ where: { id: session.userId }, select: { firstName: true } }),
    getBranchContext(session),
    getDashboardScope(session),
  ]);
  if (!tenant) return null;

  const subscription = tenant.subscription;
  const trialEndsAt = subscription?.status === "TRIALING" ? subscription.trialEndsAt : null;
  const info: HeroInfo = {
    firstName: user?.firstName || tenant.name,
    roleLabel: ALL_ROLE_LABELS[session.role] ?? session.role,
    branchName: branchContext.isMultiBranch ? branchContext.current?.name ?? null : null,
    trialDaysLeft: trialEndsAt && (session.role === "OWNER" || session.role === "ADMIN") ? daysUntil(trialEndsAt) : null,
  };

  const kind = dashboardKindFor(session.role);
  let body: React.ReactNode;
  if (kind === "owner") {
    // Same "what does this status actually mean" wording as Settings › Plan.
    const planDetail =
      subscription?.status === "TRIALING" && subscription.trialEndsAt
        ? `Trial ends ${formatDate(subscription.trialEndsAt)}`
        : subscription?.status === "EXPIRED" || subscription?.status === "PAST_DUE"
        ? "Access paused — pick a plan to reactivate"
        : subscription?.currentPeriodEnd
        ? `${subscription.status === "CANCELED" ? "Ends" : "Renews"} ${formatDate(subscription.currentPeriodEnd)}`
        : null;
    body = (
      <OwnerDashboard
        scope={scope}
        info={info}
        branchRows={branchContext.isMultiBranch && scope.permissions.all_branches ? await branchRowsFor(tenant.id, branchContext.stores, session.storeId) : null}
        plan={subscription ? { name: subscription.plan.name, detail: planDetail } : null}
      />
    );
  } else if (kind === "manager") {
    body = <ManagerDashboard scope={scope} info={info} />;
  } else if (kind === "pharmacist") {
    body = <PharmacistDashboard scope={scope} info={info} />;
  } else if (kind === "orderTaker") {
    body = <OrderTakerDashboard scope={scope} info={info} />;
  } else {
    body = <CashierDashboard scope={scope} info={info} />;
  }

  return (
    <AppShell tenantName={tenant.name} tenantId={tenant.id} planName={subscription?.plan.name} role={session.role}>
      {body}
    </AppShell>
  );
}
