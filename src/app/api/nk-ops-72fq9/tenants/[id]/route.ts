import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/session";
import { requireAdminAccessRequest, logAdminAction } from "@/lib/platform-admin";
import { sendAlertEmail } from "@/lib/email";

type Action = "suspend" | "reactivate" | "activate_plan";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const access = await requireAdminAccessRequest(request, session);
  if (!access.ok) return NextResponse.json({ error: "Forbidden", reason: access.reason }, { status: 403 });

  const { id } = await params;
  const body = (await request.json()) as {
    action: Action;
    planId?: string;
    billingCycle?: "MONTHLY" | "YEARLY";
  };
  const { action } = body;

  const tenant = await prisma.tenant.findUnique({ where: { id }, include: { subscription: true } });
  if (!tenant) return NextResponse.json({ error: "Tenant not found." }, { status: 404 });

  if (action === "suspend" || action === "reactivate") {
    const updated = await prisma.tenant.update({ where: { id }, data: { isActive: action === "reactivate" } });

    await logAdminAction({
      actorUserId: session.userId,
      actorEmail: access.email || "unknown",
      action: action === "suspend" ? "suspend_tenant" : "reactivate_tenant",
      targetType: "Tenant",
      targetId: id,
      metadata: { tenantName: tenant.name, tenantSlug: tenant.slug },
    });

    return NextResponse.json({ id: updated.id, isActive: updated.isActive });
  }

  if (action === "activate_plan") {
    const { planId, billingCycle } = body;
    if (!planId || (billingCycle !== "MONTHLY" && billingCycle !== "YEARLY")) {
      return NextResponse.json({ error: "planId and billingCycle (MONTHLY or YEARLY) are required." }, { status: 400 });
    }
    if (!tenant.subscription) {
      return NextResponse.json({ error: "This tenant has no subscription record." }, { status: 400 });
    }

    const plan = await prisma.plan.findUnique({ where: { id: planId } });
    if (!plan) return NextResponse.json({ error: "Plan not found." }, { status: 404 });

    const now = new Date();
    const periodEnd = new Date(now);
    if (billingCycle === "YEARLY") periodEnd.setFullYear(periodEnd.getFullYear() + 1);
    else periodEnd.setMonth(periodEnd.getMonth() + 1);
    const amount = billingCycle === "YEARLY" ? plan.priceYearly : plan.priceMonthly;

    await prisma.$transaction([
      prisma.subscription.update({
        where: { tenantId: id },
        data: {
          planId: plan.id,
          billingCycle,
          status: "ACTIVE",
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
          cancelAtPeriodEnd: false,
          canceledAt: null,
        },
      }),
      prisma.invoice.create({
        data: {
          subscriptionId: tenant.subscription.id,
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
      action: "activate_plan_direct",
      targetType: "Tenant",
      targetId: id,
      metadata: { tenantName: tenant.name, tenantSlug: tenant.slug, plan: plan.name, billingCycle, amount: Number(amount) },
    });

    await sendAlertEmail({
      to: [tenant.ownerEmail],
      subject: `[Nookly] Your ${plan.name} plan is now active`,
      text: `Hi! Your Nookly workspace "${tenant.name}" has been switched to the ${plan.name} plan (${billingCycle.toLowerCase()}). Thanks for your payment!`,
    }).catch((err) => console.error("Failed to send plan-activated email:", err));

    return NextResponse.json({ id, status: "ACTIVE", planName: plan.name, billingCycle, amount: Number(amount) });
  }

  return NextResponse.json({ error: "Invalid action." }, { status: 400 });
}
