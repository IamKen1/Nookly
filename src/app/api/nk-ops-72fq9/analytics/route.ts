import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/session";
import { requireAdminAccessRequest } from "@/lib/platform-admin";
import { startOfDatePH } from "@/lib/timezone";
import { PAYING_SUBSCRIPTION_WHERE, monthlyValue } from "@/lib/platform-revenue";

const DAYS = 30;

const phDateFormat = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" });

function dateKey(d: Date) {
  return phDateFormat.format(d);
}

function lastNDays(n: number) {
  const keys: string[] = [];
  const now = Date.now();
  for (let i = n - 1; i >= 0; i--) keys.push(dateKey(new Date(now - i * 86_400_000)));
  return keys;
}

export async function GET(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const access = await requireAdminAccessRequest(request, session);
  if (!access.ok) return NextResponse.json({ error: "Forbidden", reason: access.reason }, { status: 403 });

  const days = lastNDays(DAYS);
  const since = startOfDatePH(days[0]);

  const soon = new Date();
  soon.setDate(soon.getDate() + 7);

  const [
    recentSales,
    recentTenantsForGrowth,
    trialsEndingSoon,
    pastDueSubs,
    canceledLast30,
    payingSubs,
    trialingSubCount,
    everCanceledCount,
    salesByTenant,
    tenants,
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
      where: { status: "PAST_DUE", isComplimentary: false },
      include: { tenant: { select: { name: true, slug: true, ownerEmail: true } }, plan: true },
    }),
    prisma.subscription.count({ where: { canceledAt: { gte: since }, isComplimentary: false } }),
    prisma.subscription.findMany({ where: PAYING_SUBSCRIPTION_WHERE, include: { plan: true } }),
    prisma.subscription.count({ where: { status: "TRIALING" } }),
    prisma.subscription.count({ where: { status: "CANCELED", isComplimentary: false } }),
    prisma.sale.groupBy({
      by: ["tenantId"],
      where: { status: "COMPLETED" },
      _count: true,
      _sum: { totalAmount: true },
    }),
    prisma.tenant.findMany({
      select: { id: true, name: true, slug: true, subscription: { select: { isComplimentary: true, plan: { select: { name: true } } } } },
    }),
  ]);

  const salesByDay = new Map(days.map((k) => [k, { count: 0, revenue: 0 }]));
  for (const sale of recentSales) {
    const bucket = salesByDay.get(dateKey(sale.saleDate));
    if (bucket) {
      bucket.count += 1;
      bucket.revenue += Number(sale.totalAmount);
    }
  }

  const signupsByDay = new Map(days.map((k) => [k, 0]));
  for (const t of recentTenantsForGrowth) {
    const key = dateKey(t.createdAt);
    if (signupsByDay.has(key)) signupsByDay.set(key, signupsByDay.get(key)! + 1);
  }

  const tenantById = new Map(tenants.map((t) => [t.id, t]));
  const topTenants = salesByTenant
    .map((row) => {
      const t = tenantById.get(row.tenantId);
      return {
        id: row.tenantId,
        name: t?.name ?? "Unknown",
        slug: t?.slug ?? "",
        planName: t?.subscription?.plan.name ?? null,
        isComplimentary: t?.subscription?.isComplimentary ?? false,
        saleCount: row._count,
        revenue: Number(row._sum.totalAmount ?? 0),
      };
    })
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  const mrr = payingSubs.reduce((sum, s) => sum + monthlyValue(s.billingCycle, s.plan), 0);
  const arpu = payingSubs.length > 0 ? mrr / payingSubs.length : 0;

  const payingActive = payingSubs.filter((s) => s.status === "ACTIVE").length;
  const conversionBase = payingActive + trialingSubCount + everCanceledCount;
  const trialConversionRate = conversionBase > 0 ? payingActive / conversionBase : null;

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
    mrr,
    payingTenants: payingSubs.length,
    arpu,
    trialConversionRate,
    topTenants,
  });
}
