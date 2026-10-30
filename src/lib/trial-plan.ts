import { prisma } from "@/lib/prisma";
import { logAdminAction } from "@/lib/platform-admin";
import { sendAlertEmail } from "@/lib/email";
import { formatDate } from "@/lib/format";

// Lets a tenant try a different plan without ending their trial: only the
// plan changes. Status stays TRIALING, trialEndsAt is untouched (so a switch
// never extends the trial), and no invoice is created — the tenant still pays
// through a normal plan activation later.
export async function switchTrialPlan(params: {
  tenantId: string;
  planId: string;
  actorUserId: string;
  actorEmail: string;
  planRequestId?: string;
}): Promise<{ ok: true; planName: string; trialEndsAt: string } | { ok: false; status: number; error: string }> {
  const [tenant, plan] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: params.tenantId }, include: { subscription: { include: { plan: true } } } }),
    prisma.plan.findUnique({ where: { id: params.planId } }),
  ]);
  if (!tenant) return { ok: false, status: 404, error: "Tenant not found." };
  if (!plan) return { ok: false, status: 404, error: "Plan not found." };

  const subscription = tenant.subscription;
  if (!subscription) return { ok: false, status: 400, error: "This tenant has no subscription record." };
  if (subscription.status !== "TRIALING" || !subscription.trialEndsAt || subscription.trialEndsAt < new Date()) {
    return { ok: false, status: 400, error: "Only tenants with an active free trial can switch plans this way." };
  }
  if (subscription.planId === plan.id) {
    return { ok: false, status: 400, error: `This tenant is already trialing ${plan.name}.` };
  }

  await prisma.$transaction([
    prisma.subscription.update({ where: { tenantId: tenant.id }, data: { planId: plan.id } }),
    // An open request stays open so it can still be activated once payment
    // comes in; it just moves out of PENDING since we've acted on it.
    ...(params.planRequestId
      ? [prisma.planChangeRequest.updateMany({ where: { id: params.planRequestId, status: "PENDING" }, data: { status: "CONTACTED" } })]
      : []),
  ]);

  await logAdminAction({
    actorUserId: params.actorUserId,
    actorEmail: params.actorEmail,
    action: "switch_trial_plan",
    targetType: "Tenant",
    targetId: tenant.id,
    metadata: {
      tenantName: tenant.name,
      tenantSlug: tenant.slug,
      fromPlan: subscription.plan.name,
      toPlan: plan.name,
      trialEndsAt: subscription.trialEndsAt.toISOString(),
      planRequestId: params.planRequestId ?? null,
    },
  });

  const trialEnd = formatDate(subscription.trialEndsAt);
  await sendAlertEmail({
    to: [tenant.ownerEmail],
    subject: `[Nookly] Your ${plan.name} plan is now activated`,
    text: `Hi! Your Nookly workspace "${tenant.name}" is now activated on the ${plan.name} plan. All ${plan.name} features are available to you for the rest of your free trial, which ends on ${trialEnd}. To keep ${plan.name} after your trial, just let us know and we'll help you arrange payment.`,
  }).catch((err) => console.error("Failed to send trial-plan-switch email:", err));

  return { ok: true, planName: plan.name, trialEndsAt: subscription.trialEndsAt.toISOString() };
}
