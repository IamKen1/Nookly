import { prisma } from "@/lib/prisma";

export type PlanCode = "SPROUT" | "BLOOM" | "EMPIRE";

export type FeatureKey = "prescriptions" | "alerts" | "multiBranch" | "apiAccess";

const FEATURE_COLUMN: Record<
  FeatureKey,
  "featurePrescriptions" | "featureAlerts" | "featureMultiBranch" | "featureApiAccess"
> = {
  prescriptions: "featurePrescriptions",
  alerts: "featureAlerts",
  multiBranch: "featureMultiBranch",
  apiAccess: "featureApiAccess",
};

const UPGRADE_FEATURE_LABEL: Record<FeatureKey, string> = {
  prescriptions: "Prescription management",
  alerts: "Email alerts",
  multiBranch: "Multi-branch",
  apiAccess: "API access",
};

// Reports are gated individually per plan (Plan.enabledReports, a JSON array
// of report keys) — the catalog lives in src/lib/reports/registry.ts and the
// ops console's Plans tab ticks which ones each plan includes.
import { REPORT_LABELS, isReportKey, type ReportKey } from "@/lib/reports/registry";
export type { ReportKey };

export async function getEnabledReports(planCode: PlanCode | null | undefined): Promise<ReportKey[]> {
  if (!planCode) return [];
  const plan = await prisma.plan.findUnique({ where: { code: planCode }, select: { enabledReports: true } });
  const raw = plan?.enabledReports;
  return Array.isArray(raw) ? raw.filter(isReportKey) : [];
}

export async function hasReport(planCode: PlanCode | null | undefined, report: ReportKey): Promise<boolean> {
  const enabled = await getEnabledReports(planCode);
  return enabled.includes(report);
}

export function upgradeReportMessage(report: ReportKey): string {
  return `${REPORT_LABELS[report]} isn't included in your current plan. Upgrade to unlock it.`;
}

export async function requireReport(
  tenantId: string,
  report: ReportKey
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const planCode = await getTenantPlanCode(tenantId);
  if (!(await hasReport(planCode, report))) {
    return { ok: false, status: 403, error: upgradeReportMessage(report) };
  }
  return { ok: true };
}

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

// -1 means unlimited.
export async function getMaxProducts(tenantId: string): Promise<number> {
  const subscription = await prisma.subscription.findUnique({
    where: { tenantId },
    select: { plan: { select: { maxProducts: true } } },
  });
  return subscription?.plan.maxProducts ?? -1;
}

// Shared by every path that creates products (the single-product form, bulk
// import) so the limit can't be bypassed by one of them forgetting to check.
export async function requireProductCapacity(
  tenantId: string,
  additionalCount = 1
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const [maxProducts, productCount] = await Promise.all([
    getMaxProducts(tenantId),
    prisma.product.count({ where: { tenantId, isActive: true } }),
  ]);
  if (maxProducts !== -1 && productCount + additionalCount > maxProducts) {
    return {
      ok: false,
      status: 403,
      error: `You've reached the ${maxProducts}-product limit for your plan. Upgrade to add more.`,
    };
  }
  return { ok: true };
}
