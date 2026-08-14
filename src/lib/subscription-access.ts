import { prisma } from "@/lib/prisma";

export type LapseReason = "trial_expired" | "renewal_expired" | "canceled";

export interface SubscriptionLapse {
  reason: LapseReason;
  planName: string;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
}

// The single source of truth for "is this tenant still allowed in the app."
// Called from requireActiveSession() on every tenant-operational page. Lazily
// flips a subscription's status once it's found to have lapsed, so admin
// views (trials ending soon, past-due list) reflect reality without needing a
// separate cron — the first real request after the deadline does the flip.
export async function getSubscriptionLapse(tenantId: string): Promise<SubscriptionLapse | null> {
  const subscription = await prisma.subscription.findUnique({
    where: { tenantId },
    include: { plan: { select: { name: true } } },
  });
  if (!subscription) return null;

  const now = new Date();

  if (subscription.status === "CANCELED") {
    return {
      reason: "canceled",
      planName: subscription.plan.name,
      trialEndsAt: subscription.trialEndsAt?.toISOString() ?? null,
      currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null,
    };
  }

  if (subscription.status === "TRIALING" && subscription.trialEndsAt && subscription.trialEndsAt < now) {
    await prisma.subscription.update({ where: { tenantId }, data: { status: "EXPIRED" } }).catch(() => {});
    return {
      reason: "trial_expired",
      planName: subscription.plan.name,
      trialEndsAt: subscription.trialEndsAt.toISOString(),
      currentPeriodEnd: null,
    };
  }

  if (subscription.status === "ACTIVE" && subscription.currentPeriodEnd && subscription.currentPeriodEnd < now) {
    await prisma.subscription.update({ where: { tenantId }, data: { status: "PAST_DUE" } }).catch(() => {});
    return {
      reason: "renewal_expired",
      planName: subscription.plan.name,
      trialEndsAt: null,
      currentPeriodEnd: subscription.currentPeriodEnd.toISOString(),
    };
  }

  if (subscription.status === "EXPIRED") {
    return {
      reason: "trial_expired",
      planName: subscription.plan.name,
      trialEndsAt: subscription.trialEndsAt?.toISOString() ?? null,
      currentPeriodEnd: null,
    };
  }

  if (subscription.status === "PAST_DUE") {
    return {
      reason: "renewal_expired",
      planName: subscription.plan.name,
      trialEndsAt: null,
      currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null,
    };
  }

  return null;
}
