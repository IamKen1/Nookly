import { requireSession } from "@/lib/require-session";
import { prisma } from "@/lib/prisma";
import { getSubscriptionLapse } from "@/lib/subscription-access";
import UpgradeClient from "@/components/upgrade/UpgradeClient";

export default async function UpgradePage() {
  const session = await requireSession();

  const [lapse, allPlans] = await Promise.all([
    getSubscriptionLapse(session.tenantId),
    prisma.plan.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
  ]);

  return (
    <UpgradeClient
      lapse={lapse}
      canRequest={session.role === "OWNER" || session.role === "ADMIN"}
      allPlans={allPlans.map((p) => ({
        code: p.code,
        name: p.name,
        tagline: p.tagline,
        priceMonthly: Number(p.priceMonthly),
        priceYearly: Number(p.priceYearly),
        features: Array.isArray(p.features) ? (p.features as string[]) : [],
      }))}
    />
  );
}
