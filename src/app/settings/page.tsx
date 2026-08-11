import { requireSession } from "@/lib/require-session";
import { prisma } from "@/lib/prisma";
import AppShell from "@/components/app/AppShell";
import SettingsClient from "@/components/settings/SettingsClient";

const CAN_MANAGE_ROLES = ["OWNER", "ADMIN"];

export default async function SettingsPage() {
  const session = await requireSession();

  const [tenant, allPlans, storeCount, userCount, productCount] = await Promise.all([
    prisma.tenant.findUnique({
      where: { id: session.tenantId },
      include: { subscription: { include: { plan: true } } },
    }),
    prisma.plan.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
    prisma.store.count({ where: { tenantId: session.tenantId, isActive: true } }),
    prisma.user.count({ where: { tenantId: session.tenantId, isActive: true } }),
    prisma.product.count({ where: { tenantId: session.tenantId, isActive: true } }),
  ]);
  if (!tenant) return null;

  const canManage = CAN_MANAGE_ROLES.includes(session.role);

  return (
    <AppShell tenantName={tenant.name} planName={tenant.subscription?.plan.name} role={session.role}>
      <SettingsClient
        canManageAlerts={canManage}
        canManagePlan={canManage}
        currentPlan={
          tenant.subscription
            ? {
                code: tenant.subscription.plan.code,
                name: tenant.subscription.plan.name,
                status: tenant.subscription.status,
                billingCycle: tenant.subscription.billingCycle,
                currentPeriodEnd: tenant.subscription.currentPeriodEnd?.toISOString() ?? null,
                trialEndsAt: tenant.subscription.trialEndsAt?.toISOString() ?? null,
                maxStores: tenant.subscription.plan.maxStores,
                maxUsers: tenant.subscription.plan.maxUsers,
                maxProducts: tenant.subscription.plan.maxProducts,
              }
            : null
        }
        allPlans={allPlans.map((p) => ({
          code: p.code,
          name: p.name,
          priceMonthly: Number(p.priceMonthly),
          priceYearly: Number(p.priceYearly),
        }))}
        usage={{ stores: storeCount, users: userCount, products: productCount }}
      />
    </AppShell>
  );
}
