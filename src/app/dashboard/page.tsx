import { requirePagePermission } from "@/lib/require-session";
import { prisma } from "@/lib/prisma";
import { daysUntil } from "@/lib/plans";
import { formatDate } from "@/lib/format";
import { RENEWAL_NOTICE_DAYS, phDaysUntil, renewalDueLabel } from "@/lib/renewal";
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

  // A paid period ending soon goes in the banner, where whoever runs the plan
  // can't miss it. Free (complimentary) workspaces have nothing to renew.
  let renewal: HeroInfo["renewal"] = null;
  const periodEnd = subscription?.currentPeriodEnd;
  if (
    periodEnd &&
    (subscription.status === "ACTIVE" || subscription.status === "CANCELED") &&
    !subscription.isComplimentary &&
    scope.permissions.settings &&
    phDaysUntil(periodEnd) <= RENEWAL_NOTICE_DAYS
  ) {
    const daysLeft = phDaysUntil(periodEnd);
    const requested = await prisma.planChangeRequest.count({ where: { tenantId: tenant.id, status: { in: ["PENDING", "CONTACTED"] } } });
    renewal = {
      urgent: daysLeft <= 1,
      requested: requested > 0,
      text:
        subscription.status === "CANCELED"
          ? `Your plan ends ${renewalDueLabel(daysLeft)}`
          : requested > 0
          ? "Renewal requested"
          : `Renewal due ${renewalDueLabel(daysLeft)}`,
    };
  }

  const info: HeroInfo = {
    firstName: user?.firstName || tenant.name,
    roleLabel: ALL_ROLE_LABELS[session.role] ?? session.role,
    branchName: branchContext.isMultiBranch ? branchContext.current?.name ?? null : null,
    isMultiBranch: branchContext.isMultiBranch,
    trialDaysLeft: trialEndsAt && (session.role === "OWNER" || session.role === "ADMIN") ? daysUntil(trialEndsAt) : null,
    renewal,
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
        ? `${subscription.status === "CANCELED" ? "Ends" : "Renewal due"} ${formatDate(subscription.currentPeriodEnd)}`
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
  } else if (kind === "orderTaker" || (kind === "cashier" && !scope.permissions.pos_checkout && scope.permissions.pos_send_to_cashier)) {
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
