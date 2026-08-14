import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/session";
import { requireAdminAccessRequest, logAdminAction } from "@/lib/platform-admin";
import { sendAlertEmail } from "@/lib/email";

type Action = "contacted" | "activate" | "cancel";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const access = await requireAdminAccessRequest(request, session);
  if (!access.ok) return NextResponse.json({ error: "Forbidden", reason: access.reason }, { status: 403 });

  const { id } = await params;
  const body = await request.json();
  const { action, resolvedNote }: { action: Action; resolvedNote?: string } = body;

  const planRequest = await prisma.planChangeRequest.findUnique({
    where: { id },
    include: { tenant: { include: { subscription: true } }, currentPlan: true, requestedPlan: true },
  });
  if (!planRequest) return NextResponse.json({ error: "Request not found." }, { status: 404 });
  if (planRequest.status === "ACTIVATED" || planRequest.status === "CANCELLED") {
    return NextResponse.json({ error: `Request is already ${planRequest.status.toLowerCase()}.` }, { status: 400 });
  }

  if (action === "contacted") {
    const updated = await prisma.planChangeRequest.update({
      where: { id },
      data: { status: "CONTACTED", resolvedNote: resolvedNote || null },
    });
    await logAdminAction({
      actorUserId: session.userId,
      actorEmail: access.email || "unknown",
      action: "plan_request_contacted",
      targetType: "PlanChangeRequest",
      targetId: id,
      metadata: { tenantSlug: planRequest.tenant.slug },
    });
    return NextResponse.json(updated);
  }

  if (action === "cancel") {
    const updated = await prisma.planChangeRequest.update({
      where: { id },
      data: { status: "CANCELLED", resolvedAt: new Date(), resolvedNote: resolvedNote || null },
    });
    await logAdminAction({
      actorUserId: session.userId,
      actorEmail: access.email || "unknown",
      action: "plan_request_cancelled",
      targetType: "PlanChangeRequest",
      targetId: id,
      metadata: { tenantSlug: planRequest.tenant.slug },
    });
    return NextResponse.json(updated);
  }

  if (action === "activate") {
    if (!planRequest.tenant.subscription) {
      return NextResponse.json({ error: "This tenant has no subscription record." }, { status: 400 });
    }

    const now = new Date();
    const periodEnd = new Date(now);
    if (planRequest.billingCycle === "YEARLY") periodEnd.setFullYear(periodEnd.getFullYear() + 1);
    else periodEnd.setMonth(periodEnd.getMonth() + 1);
    const amount = planRequest.billingCycle === "YEARLY" ? planRequest.requestedPlan.priceYearly : planRequest.requestedPlan.priceMonthly;

    const [, updatedRequest] = await prisma.$transaction([
      prisma.subscription.update({
        where: { tenantId: planRequest.tenantId },
        data: {
          planId: planRequest.requestedPlanId,
          billingCycle: planRequest.billingCycle,
          status: "ACTIVE",
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
          cancelAtPeriodEnd: false,
        },
      }),
      prisma.planChangeRequest.update({
        where: { id },
        data: { status: "ACTIVATED", resolvedAt: now, resolvedNote: resolvedNote || null },
      }),
      prisma.invoice.create({
        data: {
          subscriptionId: planRequest.tenant.subscription.id,
          amount,
          status: "PAID",
          periodStart: now,
          periodEnd,
          paidAt: now,
        },
      }),
    ]);

    await logAdminAction({
      actorUserId: session.userId,
      actorEmail: access.email || "unknown",
      action: "plan_request_activated",
      targetType: "PlanChangeRequest",
      targetId: id,
      metadata: { tenantSlug: planRequest.tenant.slug, plan: planRequest.requestedPlan.name, billingCycle: planRequest.billingCycle },
    });

    await sendAlertEmail({
      to: [planRequest.tenant.ownerEmail],
      subject: `[Nookly] Your ${planRequest.requestedPlan.name} plan is now active`,
      text: `Hi! Your Nookly workspace "${planRequest.tenant.name}" has been switched to the ${planRequest.requestedPlan.name} plan (${planRequest.billingCycle.toLowerCase()}). Thanks for your payment!`,
    }).catch((err) => console.error("Failed to send plan-activated email:", err));

    return NextResponse.json(updatedRequest);
  }

  return NextResponse.json({ error: "Invalid action." }, { status: 400 });
}
