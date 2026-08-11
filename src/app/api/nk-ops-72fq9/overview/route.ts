import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/session";
import { requireAdminAccessRequest } from "@/lib/platform-admin";

export async function GET(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const access = await requireAdminAccessRequest(request, session);
  if (!access.ok) return NextResponse.json({ error: "Forbidden", reason: access.reason }, { status: 403 });

  const [
    tenantCount,
    activeTenantCount,
    trialingCount,
    activeSubCount,
    pastDueCount,
    canceledCount,
    userCount,
    productCount,
    saleAgg,
    salesToday,
    pendingPlanRequests,
    plansWithCounts,
    recentTenants,
  ] = await Promise.all([
    prisma.tenant.count(),
    prisma.tenant.count({ where: { isActive: true } }),
    prisma.subscription.count({ where: { status: "TRIALING" } }),
    prisma.subscription.count({ where: { status: "ACTIVE" } }),
    prisma.subscription.count({ where: { status: "PAST_DUE" } }),
    prisma.subscription.count({ where: { status: "CANCELED" } }),
    prisma.user.count({ where: { isActive: true } }),
    prisma.product.count({ where: { isActive: true } }),
    prisma.sale.aggregate({ where: { status: "COMPLETED" }, _sum: { totalAmount: true }, _count: true }),
    prisma.sale.aggregate({
      where: { status: "COMPLETED", saleDate: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
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
  ]);

  const mrr = plansWithCounts.reduce((sum, p) => sum + Number(p.priceMonthly) * p._count.subscriptions, 0);

  return NextResponse.json({
    tenants: { total: tenantCount, active: activeTenantCount, suspended: tenantCount - activeTenantCount },
    subscriptions: { trialing: trialingCount, active: activeSubCount, pastDue: pastDueCount, canceled: canceledCount },
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
      status: t.subscription?.status ?? null,
    })),
  });
}
