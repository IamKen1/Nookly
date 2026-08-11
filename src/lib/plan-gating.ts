import { prisma } from "@/lib/prisma";

export type PlanCode = "SPROUT" | "BLOOM" | "EMPIRE";

export type FeatureKey = "reports" | "prescriptions" | "alerts" | "multiBranch";

const FEATURE_COLUMN: Record<FeatureKey, "featureReports" | "featurePrescriptions" | "featureAlerts" | "featureMultiBranch"> = {
  reports: "featureReports",
  prescriptions: "featurePrescriptions",
  alerts: "featureAlerts",
  multiBranch: "featureMultiBranch",
};

const UPGRADE_FEATURE_LABEL: Record<FeatureKey, string> = {
  reports: "Reports",
  prescriptions: "Prescription management",
  alerts: "Email alerts",
  multiBranch: "Multi-branch",
};

// Admin-configurable via the ops console "Plans" tab — each plan's checklist
// of boolean feature flags drives both gating here and the pricing page.
export async function hasFeature(planCode: PlanCode | null | undefined, feature: FeatureKey): Promise<boolean> {
  if (!planCode) return false;
  const plan = await prisma.plan.findUnique({ where: { code: planCode }, select: { [FEATURE_COLUMN[feature]]: true } });
  return Boolean(plan?.[FEATURE_COLUMN[feature]]);
}

export function upgradeMessage(feature: FeatureKey): string {
  return `${UPGRADE_FEATURE_LABEL[feature]} isn't included in your current plan. Upgrade to unlock it.`;
}

export async function getTenantPlanCode(tenantId: string): Promise<PlanCode | null> {
  const subscription = await prisma.subscription.findUnique({
    where: { tenantId },
    include: { plan: true },
  });
  return (subscription?.plan.code as PlanCode | undefined) ?? null;
}

export async function requireFeature(
  tenantId: string,
  feature: FeatureKey
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const planCode = await getTenantPlanCode(tenantId);
  if (!(await hasFeature(planCode, feature))) {
    return { ok: false, status: 403, error: upgradeMessage(feature) };
  }
  return { ok: true };
}
