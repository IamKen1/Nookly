import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/session";
import { requireAdminAccessRequest } from "@/lib/platform-admin";

export async function GET(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const access = await requireAdminAccessRequest(request, session);
  if (!access.ok) return NextResponse.json({ error: "Forbidden", reason: access.reason }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search")?.trim();

  const tenants = await prisma.tenant.findMany({
    where: search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { slug: { contains: search, mode: "insensitive" } },
            { ownerEmail: { contains: search, mode: "insensitive" } },
          ],
        }
      : undefined,
    include: {
      subscription: { include: { plan: true } },
      // Active-only counts — this is what the plan's maxUsers/maxProducts
      // limits actually enforce against (src/app/api/products|users/route.ts),
      // so it's what belongs next to "X / max" in the admin UI. Archived/
      // inactive records are real but don't count toward the limit.
      _count: {
        select: {
          users: { where: { isActive: true } },
          products: { where: { isActive: true } },
          stores: { where: { isActive: true } },
          sales: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  // Lifetime totals (including archived/inactive) — shown as a secondary
  // detail so "674 total, 634 active" is never mistaken for being over a
  // 650 active-only limit. Tenant counts are small enough that one query
  // pair per tenant is cheap; not worth a heavier single aggregate query.
  const totals = await Promise.all(
    tenants.map(async (t) => {
      const [totalProducts, totalUsers] = await Promise.all([
        prisma.product.count({ where: { tenantId: t.id } }),
        prisma.user.count({ where: { tenantId: t.id } }),
      ]);
      return [t.id, { totalProducts, totalUsers }] as const;
    })
  );
  const totalsByTenant = new Map(totals);

  return NextResponse.json(
    tenants.map((t) => {
      const plan = t.subscription?.plan;
      const totalsForTenant = totalsByTenant.get(t.id)!;
      return {
        id: t.id,
        name: t.name,
        slug: t.slug,
        ownerEmail: t.ownerEmail,
        contactNumber: t.contactNumber,
        isActive: t.isActive,
        createdAt: t.createdAt.toISOString(),
        plan: t.subscription
          ? {
              code: t.subscription.plan.code,
              name: t.subscription.plan.name,
              status: t.subscription.status,
              isComplimentary: t.subscription.isComplimentary,
              billingCycle: t.subscription.billingCycle,
              // Whichever date actually matters for "when does this lapse" —
              // trial end while trialing, renewal date once on a paid cycle.
              expiresAt: (t.subscription.status === "TRIALING" ? t.subscription.trialEndsAt : t.subscription.currentPeriodEnd)?.toISOString() ?? null,
            }
          : null,
        usage: {
          users: { active: t._count.users, total: totalsForTenant.totalUsers, max: plan?.maxUsers ?? -1 },
          products: { active: t._count.products, total: totalsForTenant.totalProducts, max: plan?.maxProducts ?? -1 },
          stores: { active: t._count.stores, max: plan?.maxStores ?? -1 },
          sales: t._count.sales,
        },
      };
    })
  );
}
