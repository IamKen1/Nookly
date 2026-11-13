import { cache } from "react";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// Per-request memoized loaders. React `cache()` dedupes within one Server
// Component render (layout + AppShell + page share one result); in route
// handlers and server actions it simply calls through, so every API request
// still reads fresh data. Never swap these for "use cache" / unstable_cache:
// subscription status and plan must not be served across requests.

export type SubscriptionWithPlan = Prisma.SubscriptionGetPayload<{ include: { plan: true } }>;
export type TenantWithPlan = Prisma.TenantGetPayload<{ include: { subscription: { include: { plan: true } } } }>;

// The tenant's subscription with its full plan row. Shared by the lapse check,
// plan-code lookups and getTenantWithPlan.
export const getSubscriptionWithPlan = cache(
  (tenantId: string): Promise<SubscriptionWithPlan | null> =>
    prisma.subscription.findUnique({ where: { tenantId }, include: { plan: true } })
);

// Same shape as `prisma.tenant.findUnique({ where: { id }, include: { subscription:
// { include: { plan: true } } } })`, but the tenant row is read in parallel with
// the (shared, memoized) subscription+plan read.
export const getTenantWithPlan = cache(async (tenantId: string): Promise<TenantWithPlan | null> => {
  const [tenant, subscription] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: tenantId } }),
    getSubscriptionWithPlan(tenantId),
  ]);
  return tenant ? { ...tenant, subscription } : null;
});
