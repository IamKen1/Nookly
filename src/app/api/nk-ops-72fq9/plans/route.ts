import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/session";
import { requireAdminAccessRequest } from "@/lib/platform-admin";

export async function GET(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const access = await requireAdminAccessRequest(request, session);
  if (!access.ok) return NextResponse.json({ error: "Forbidden", reason: access.reason }, { status: 403 });

  const plans = await prisma.plan.findMany({
    orderBy: { sortOrder: "asc" },
    include: { _count: { select: { subscriptions: true } } },
  });

  return NextResponse.json(
    plans.map((p) => ({
      id: p.id,
      code: p.code,
      name: p.name,
      tagline: p.tagline,
      priceMonthly: Number(p.priceMonthly),
      priceYearly: Number(p.priceYearly),
      maxStores: p.maxStores,
      maxUsers: p.maxUsers,
      maxProducts: p.maxProducts,
      features: Array.isArray(p.features) ? p.features : [],
      featureReports: p.featureReports,
      featurePrescriptions: p.featurePrescriptions,
      featureAlerts: p.featureAlerts,
      featureMultiBranch: p.featureMultiBranch,
      featureApiAccess: p.featureApiAccess,
      isActive: p.isActive,
      tenantCount: p._count.subscriptions,
    }))
  );
}
