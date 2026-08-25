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
      _count: { select: { users: true, products: true, sales: true, stores: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return NextResponse.json(
    tenants.map((t) => ({
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
            // Whichever date actually matters for "when does this lapse" —
            // trial end while trialing, renewal date once on a paid cycle.
            expiresAt: (t.subscription.status === "TRIALING" ? t.subscription.trialEndsAt : t.subscription.currentPeriodEnd)?.toISOString() ?? null,
          }
        : null,
      counts: t._count,
    }))
  );
}
