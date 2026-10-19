import type { BillingCycle, Prisma } from "@prisma/client";

// Single definition of "a tenant paying Nookly" for every admin metric.
// Complimentary subscriptions are ACTIVE (full access) but bring in no money.
export const PAYING_SUBSCRIPTION_WHERE: Prisma.SubscriptionWhereInput = {
  status: { in: ["ACTIVE", "PAST_DUE"] },
  isComplimentary: false,
};

export const REAL_PAYMENT_WHERE: Prisma.InvoiceWhereInput = {
  status: "PAID",
  subscription: { isComplimentary: false },
};

export function monthlyValue(billingCycle: BillingCycle, plan: { priceMonthly: unknown; priceYearly: unknown }) {
  return billingCycle === "YEARLY" ? Number(plan.priceYearly) / 12 : Number(plan.priceMonthly);
}
