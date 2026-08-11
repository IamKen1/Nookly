import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/session";
import { requireAdminAccessRequest } from "@/lib/platform-admin";

const DAYS = 30;

function dateKey(d: Date) {
  return d.toISOString().slice(0, 10);
}

function lastNDays(n: number) {
  const keys: string[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    keys.push(dateKey(d));
  }
  return keys;
}

export async function GET(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const access = await requireAdminAccessRequest(request, session);
  if (!access.ok) return NextResponse.json({ error: "Forbidden", reason: access.reason }, { status: 403 });

  const since = new Date();
  since.setDate(since.getDate() - (DAYS - 1));
  since.setHours(0, 0, 0, 0);

  const soon = new Date();
  soon.setDate(soon.getDate() + 7);

  const [
    recentSales,
    recentTenantsForGrowth,
    trialsEndingSoon,
    pastDueSubs,
    canceledLast30,
    activeSubCount,
    trialingSubCount,
    everCanceledCount,
    topTenantsRaw,
  ] = await Promise.all([
    prisma.sale.findMany({
      where: { status: "COMPLETED", saleDate: { gte: since } },
      select: { saleDate: true, totalAmount: true },
    }),
    prisma.tenant.findMany({
      where: { createdAt: { gte: since } },
      select: { createdAt: true },
    }),
    prisma.subscription.findMany({
      where: { status: "TRIALING", trialEndsAt: { gte: new Date(), lte: soon } },
      include: { tenant: { select: { name: true, slug: true, ownerEmail: true } } },
      orderBy: { trialEndsAt: "asc" },
    }),
    prisma.subscription.findMany({
      where: { status: "PAST_DUE" },
      include: { tenant: { select: { name: true, slug: true, ownerEmail: true } }, plan: true },
    }),
    prisma.subscription.count({ where: { canceledAt: { gte: since } } }),
    prisma.subscription.count({ where: { status: "ACTIVE" } }),
    prisma.subscription.count({ where: { status: "TRIALING" } }),
    prisma.subscription.count({ where: { status: "CANCELED" } }),
    prisma.tenant.findMany({
      include: {
        subscription: { include: { plan: true } },
        sales: { where: { status: "COMPLETED" }, select: { totalAmount: true } },
      },
    }),
  ]);

  const days = lastNDays(DAYS);
  const salesByDay = new Map(days.map((k) => [k, { count: 0, revenue: 0 }]));
  for (const sale of recentSales) {
    const key = dateKey(sale.saleDate);
    const bucket = salesByDay.get(key);
    if (bucket) {
      bucket.count += 1;
      bucket.revenue += Number(sale.totalAmount);
    }
  }

  const signupsByDay = new Map(days.map((k) => [k, 0]));
  for (const t of recentTenantsForGrowth) {
    const key = dateKey(t.createdAt);
    signupsByDay.set(key, (signupsByDay.get(key) ?? 0) + 1);
  }

  const topTenants = topTenantsRaw
    .map((t) => ({
      id: t.id,
      name: t.name,
      slug: t.slug,
      planName: t.subscription?.plan.name ?? null,
      saleCount: t.sales.length,
      revenue: t.sales.reduce((sum, s) => sum + Number(s.totalAmount), 0),
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  const payingTenants = activeSubCount + pastDueSubs.length;
  const estimatedMrr = topTenantsRaw.reduce((sum, t) => {
    if (!t.subscription || (t.subscription.status !== "ACTIVE" && t.subscription.status !== "PAST_DUE")) return sum;
    return sum + Number(t.subscription.plan.priceMonthly);
  }, 0);
  const arpu = payingTenants > 0 ? estimatedMrr / payingTenants : 0;

  const conversionBase = activeSubCount + trialingSubCount + everCanceledCount;
  const trialConversionRate = conversionBase > 0 ? activeSubCount / conversionBase : null;

  return NextResponse.json({
    salesTrend: days.map((day) => ({ day, ...salesByDay.get(day)! })),
    signupTrend: days.map((day) => ({ day, count: signupsByDay.get(day) ?? 0 })),
    trialsEndingSoon: trialsEndingSoon.map((s) => ({
      tenantName: s.tenant.name,
      tenantSlug: s.tenant.slug,
      ownerEmail: s.tenant.ownerEmail,
      trialEndsAt: s.trialEndsAt?.toISOString() ?? null,
    })),
    pastDueTenants: pastDueSubs.map((s) => ({
      tenantName: s.tenant.name,
      tenantSlug: s.tenant.slug,
      ownerEmail: s.tenant.ownerEmail,
      planName: s.plan.name,
    })),
    canceledLast30,
    arpu,
    trialConversionRate,
    topTenants,
  });
}
