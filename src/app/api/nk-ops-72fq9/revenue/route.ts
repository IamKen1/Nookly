import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/session";
import { requireAdminAccessRequest } from "@/lib/platform-admin";
import { getPeriodKey, getPeriodLabel, type ReportPeriod } from "@/lib/report-periods";
import { PAYING_SUBSCRIPTION_WHERE, REAL_PAYMENT_WHERE, monthlyValue } from "@/lib/platform-revenue";

export async function GET(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const access = await requireAdminAccessRequest(request, session);
  if (!access.ok) return NextResponse.json({ error: "Forbidden", reason: access.reason }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const timeZone = searchParams.get("timeZone") || "Asia/Manila";
  const period: ReportPeriod = (searchParams.get("period") as ReportPeriod) || "monthly";

  const dateFilter: Record<string, Date> = {};
  if (startDate) dateFilter.gte = new Date(`${startDate}T00:00:00`);
  if (endDate) dateFilter.lte = new Date(`${endDate}T23:59:59`);

  const [invoices, activeSubs, complimentarySubs] = await Promise.all([
    // This is platform revenue — money Nookly collected from tenants for their
    // subscription. It has nothing to do with what a tenant earns from their
    // own product sales (that's the tenant's own income, tracked separately
    // under their per-tenant Reports/Sales pages).
    prisma.invoice.findMany({
      where: {
        ...REAL_PAYMENT_WHERE,
        ...(Object.keys(dateFilter).length > 0 ? { paidAt: dateFilter } : {}),
      },
      include: {
        subscription: {
          include: {
            plan: { select: { name: true, code: true } },
            tenant: { select: { name: true, slug: true, ownerEmail: true } },
          },
        },
      },
      orderBy: { paidAt: "desc" },
    }),
    prisma.subscription.findMany({
      where: PAYING_SUBSCRIPTION_WHERE,
      include: {
        plan: { select: { name: true, code: true, priceMonthly: true, priceYearly: true } },
        tenant: { select: { name: true, slug: true, ownerEmail: true } },
      },
      orderBy: { currentPeriodEnd: "asc" },
    }),
    prisma.subscription.findMany({
      where: { isComplimentary: true },
      include: { plan: { select: { name: true } }, tenant: { select: { name: true, slug: true, ownerEmail: true } } },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const totalRevenueCollected = invoices.reduce((sum, inv) => sum + Number(inv.amount), 0);

  const mrr = activeSubs.reduce((sum, sub) => sum + monthlyValue(sub.billingCycle, sub.plan), 0);

  const payingTenantsCount = activeSubs.length;
  const arpu = payingTenantsCount > 0 ? mrr / payingTenantsCount : 0;

  const byPlan = new Map<string, { planName: string; payingTenants: number; mrr: number }>();
  for (const s of activeSubs) {
    const row = byPlan.get(s.planId) ?? { planName: s.plan.name, payingTenants: 0, mrr: 0 };
    row.payingTenants += 1;
    row.mrr += monthlyValue(s.billingCycle, s.plan);
    byPlan.set(s.planId, row);
  }
  const planBreakdown = Array.from(byPlan.values());

  const periodMap = new Map<string, { count: number; total: number }>();
  for (const inv of invoices) {
    if (!inv.paidAt) continue;
    const key = getPeriodKey(inv.paidAt, period, timeZone);
    const bucket = periodMap.get(key) ?? { count: 0, total: 0 };
    bucket.count += 1;
    bucket.total += Number(inv.amount);
    periodMap.set(key, bucket);
  }
  const trend = Array.from(periodMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, totals]) => ({ periodKey: key, periodLabel: getPeriodLabel(key, period), ...totals }));

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    timeZone,
    period,
    filters: { startDate: startDate || null, endDate: endDate || null },
    summary: {
      totalRevenueCollected,
      invoiceCount: invoices.length,
      mrr,
      payingTenantsCount,
      arpu,
    },
    planBreakdown,
    trend,
    payingTenants: activeSubs.map((s) => ({
      tenantName: s.tenant.name,
      tenantSlug: s.tenant.slug,
      ownerEmail: s.tenant.ownerEmail,
      planName: s.plan.name,
      status: s.status,
      billingCycle: s.billingCycle,
      currentPeriodEnd: s.currentPeriodEnd?.toISOString() ?? null,
    })),
    complimentaryTenants: complimentarySubs.map((s) => ({
      tenantName: s.tenant.name,
      tenantSlug: s.tenant.slug,
      ownerEmail: s.tenant.ownerEmail,
      planName: s.plan.name,
    })),
    payments: invoices.slice(0, 200).map((inv) => ({
      tenantName: inv.subscription.tenant.name,
      tenantSlug: inv.subscription.tenant.slug,
      planName: inv.subscription.plan.name,
      billingCycle: inv.subscription.billingCycle,
      amount: Number(inv.amount),
      paidAt: inv.paidAt?.toISOString() ?? null,
    })),
  });
}
