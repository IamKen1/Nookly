import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/session";
import { requireAdminAccessRequest, logAdminAction } from "@/lib/platform-admin";

interface PlanUpdateBody {
  name?: string;
  tagline?: string | null;
  priceMonthly?: number;
  priceYearly?: number;
  maxStores?: number;
  maxUsers?: number;
  maxProducts?: number;
  features?: string[];
  featureReports?: boolean;
  featurePrescriptions?: boolean;
  featureAlerts?: boolean;
  featureMultiBranch?: boolean;
  featureApiAccess?: boolean;
  isActive?: boolean;
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const access = await requireAdminAccessRequest(request, session);
  if (!access.ok) return NextResponse.json({ error: "Forbidden", reason: access.reason }, { status: 403 });

  const { id } = await params;
  const plan = await prisma.plan.findUnique({ where: { id } });
  if (!plan) return NextResponse.json({ error: "Plan not found." }, { status: 404 });

  const body: PlanUpdateBody = await request.json();

  const updated = await prisma.plan.update({
    where: { id },
    data: {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.tagline !== undefined ? { tagline: body.tagline } : {}),
      ...(body.priceMonthly !== undefined ? { priceMonthly: body.priceMonthly } : {}),
      ...(body.priceYearly !== undefined ? { priceYearly: body.priceYearly } : {}),
      ...(body.maxStores !== undefined ? { maxStores: body.maxStores } : {}),
      ...(body.maxUsers !== undefined ? { maxUsers: body.maxUsers } : {}),
      ...(body.maxProducts !== undefined ? { maxProducts: body.maxProducts } : {}),
      ...(body.features !== undefined ? { features: body.features } : {}),
      ...(body.featureReports !== undefined ? { featureReports: body.featureReports } : {}),
      ...(body.featurePrescriptions !== undefined ? { featurePrescriptions: body.featurePrescriptions } : {}),
      ...(body.featureAlerts !== undefined ? { featureAlerts: body.featureAlerts } : {}),
      ...(body.featureMultiBranch !== undefined ? { featureMultiBranch: body.featureMultiBranch } : {}),
      ...(body.featureApiAccess !== undefined ? { featureApiAccess: body.featureApiAccess } : {}),
      ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
    },
  });

  await logAdminAction({
    actorUserId: session.userId,
    actorEmail: access.email || "unknown",
    action: "plan_updated",
    targetType: "Plan",
    targetId: id,
    metadata: { planCode: plan.code, changes: body },
  });

  return NextResponse.json(updated);
}
