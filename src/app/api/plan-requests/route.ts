import { NextRequest, NextResponse } from "next/server";
import { PlanCode } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/session";
import { sendAlertEmail } from "@/lib/email";
import { platformAdminRecipients } from "@/lib/platform-admin";
import { ADMIN_BASE_PATH } from "@/lib/admin-path";
import { hasPermission } from "@/lib/permissions";

export async function GET(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const requests = await prisma.planChangeRequest.findMany({
    where: { tenantId: session.tenantId },
    include: { currentPlan: true, requestedPlan: true },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(requests);
}

export async function POST(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasPermission(session.tenantId, session.role, "settings"))) {
    return NextResponse.json({ error: "Only the workspace owner or admin can request a plan change." }, { status: 403 });
  }

  const body = await request.json();
  const { requestedPlanCode, billingCycle, note } = body as {
    requestedPlanCode: string;
    billingCycle?: "MONTHLY" | "YEARLY";
    note?: string;
  };

  if (!Object.values(PlanCode).includes(requestedPlanCode as PlanCode)) {
    return NextResponse.json({ error: "Invalid plan." }, { status: 400 });
  }

  const [tenant, subscription, requestedPlan] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: session.tenantId } }),
    prisma.subscription.findUnique({ where: { tenantId: session.tenantId }, include: { plan: true } }),
    prisma.plan.findUnique({ where: { code: requestedPlanCode as PlanCode } }),
  ]);

  if (!tenant || !subscription || !requestedPlan) {
    return NextResponse.json({ error: "Could not resolve tenant, current subscription, or requested plan." }, { status: 400 });
  }
  if (subscription.planId === requestedPlan.id) {
    return NextResponse.json({ error: "You're already on this plan." }, { status: 400 });
  }

  const existingPending = await prisma.planChangeRequest.findFirst({
    where: { tenantId: session.tenantId, status: { in: ["PENDING", "CONTACTED"] } },
  });
  if (existingPending) {
    return NextResponse.json({ error: "You already have a pending plan change request." }, { status: 409 });
  }

  const created = await prisma.planChangeRequest.create({
    data: {
      tenantId: session.tenantId,
      currentPlanId: subscription.planId,
      requestedPlanId: requestedPlan.id,
      billingCycle: billingCycle === "YEARLY" ? "YEARLY" : "MONTHLY",
      note: note || null,
      requestedByUserId: session.userId,
    },
    include: { currentPlan: true, requestedPlan: true },
  });

  if (platformAdminRecipients.length > 0) {
    await sendAlertEmail({
      to: platformAdminRecipients,
      subject: `[Nookly] Plan change request — ${tenant.name}`,
      text: [
        `Tenant: ${tenant.name} (${tenant.slug})`,
        `Owner email: ${tenant.ownerEmail}`,
        `Contact number: ${tenant.contactNumber || "N/A"}`,
        `Current plan: ${created.currentPlan.name}`,
        `Requested plan: ${created.requestedPlan.name} (${created.billingCycle})`,
        note ? `Note from tenant: ${note}` : "",
        "",
        `Reach out to arrange payment, then activate the new plan from the ops console (/${ADMIN_BASE_PATH}).`,
      ]
        .filter(Boolean)
        .join("\n"),
    }).catch((err) => console.error("Failed to send plan-request notification:", err));
  }

  return NextResponse.json(created, { status: 201 });
}
