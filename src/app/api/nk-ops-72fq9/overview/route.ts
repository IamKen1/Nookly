import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/session";
import { requireAdminAccessRequest } from "@/lib/platform-admin";
import { startOfTodayPH } from "@/lib/timezone";
import { PAYING_SUBSCRIPTION_WHERE, monthlyValue } from "@/lib/platform-revenue";

export async function GET(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const access = await requireAdminAccessRequest(request, session);
  if (!access.ok) return NextResponse.json({ error: "Forbidden", reason: access.reason }, { status: 403 });

  const [
    tenantCount,
    activeTenantCount,
    trialingCount,
    payingActiveCount,
    complimentaryCount,
    pastDueCount,
    canceledCount,
    userCount,
    productCount,
    saleAgg,
    salesToday,
    pendingPlanRequests,
    plansWithCounts,
    recentTenants,
    payingSubs,
  ] = await Promise.all([
    prisma.tenant.count(),
    prisma.tenant.count({ where: { isActive: true } }),
    prisma.subscription.count({ where: { status: "TRIALING" } }),
    prisma.subscription.count({ where: { status: "ACTIVE", isComplimentary: false } }),
    prisma.subscription.count({ where: { isComplimentary: true } }),
    prisma.subscription.count({ where: { status: "PAST_DUE", isComplimentary: false } }),
    prisma.subscription.count({ where: { status: "CANCELED" } }),
    prisma.user.count({ where: { isActive: true } }),
    prisma.product.count({ where: { isActive: true } }),
    prisma.sale.aggregate({ where: { status: "COMPLETED" }, _sum: { totalAmount: true }, _count: true }),
    prisma.sale.aggregate({
      where: { status: "COMPLETED", saleDate: { gte: startOfTodayPH() } },
      _sum: { totalAmount: true },
      _count: true,
    }),
    prisma.planChangeRequest.count({ where: { status: { in: ["PENDING", "CONTACTED"] } } }),
    prisma.plan.findMany({
      orderBy: { sortOrder: "asc" },
      include: { _count: { select: { subscriptions: true } } },
    }),
    prisma.tenant.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { id: true, name: true, slug: true, createdAt: true, subscription: { include: { plan: true } } },
    }),
    prisma.subscription.findMany({ where: PAYING_SUBSCRIPTION_WHERE, include: { plan: true } }),
  ]);

  const mrr = payingSubs.reduce((sum, s) => sum + monthlyValue(s.billingCycle, s.plan), 0);

  return NextResponse.json({
    tenants: { total: tenantCount, active: activeTenantCount, suspended: tenantCount - activeTenantCount },
    subscriptions: {
      trialing: trialingCount,
      paying: payingActiveCount,
      complimentary: complimentaryCount,
      pastDue: pastDueCount,
      canceled: canceledCount,
    },
    payingTenants: payingSubs.length,
    users: userCount,
    products: productCount,
    sales: {
      allTimeCount: saleAgg._count,
      allTimeRevenue: Number(saleAgg._sum.totalAmount ?? 0),
      todayCount: salesToday._count,
      todayRevenue: Number(salesToday._sum.totalAmount ?? 0),
    },
    pendingPlanRequests,
    estimatedMrr: mrr,
    planBreakdown: plansWithCounts.map((p) => ({ code: p.code, name: p.name, tenantCount: p._count.subscriptions })),
    recentTenants: recentTenants.map((t) => ({
      id: t.id,
      name: t.name,
      slug: t.slug,
      createdAt: t.createdAt.toISOString(),
      planName: t.subscription?.plan.name ?? null,
      status: t.subscription?.isComplimentary ? "COMPLIMENTARY" : t.subscription?.status ?? null,
    })),
  });
}
