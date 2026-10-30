import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/session";
import { hasPermission } from "@/lib/permissions";

export async function GET(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const stores = await prisma.store.findMany({
    where: { tenantId: session.tenantId },
    select: {
      id: true,
      name: true,
      code: true,
      address: true,
      city: true,
      isMainBranch: true,
      isActive: true,
      _count: { select: { users: { where: { isActive: true } } } },
    },
    orderBy: [{ isMainBranch: "desc" }, { createdAt: "asc" }],
  });

  return NextResponse.json(
    stores.map(({ _count, ...s }) => ({ ...s, userCount: _count.users, isCurrent: s.id === session.storeId }))
  );
}

export async function POST(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasPermission(session.tenantId, session.role, "settings"))) {
    return NextResponse.json({ error: "Only the workspace owner or admin can add branches." }, { status: 403 });
  }

  const body = await request.json();
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const address = typeof body.address === "string" ? body.address.trim() : "";
  const city = typeof body.city === "string" ? body.city.trim() : "";
  if (!name) return NextResponse.json({ error: "Branch name is required." }, { status: 400 });

  const [subscription, activeCount, existingCodes] = await Promise.all([
    prisma.subscription.findUnique({ where: { tenantId: session.tenantId }, include: { plan: true } }),
    prisma.store.count({ where: { tenantId: session.tenantId, isActive: true } }),
    prisma.store.findMany({ where: { tenantId: session.tenantId }, select: { code: true } }),
  ]);
  const maxStores = subscription?.plan.maxStores ?? 1;
  if (maxStores !== -1 && activeCount >= maxStores) {
    return NextResponse.json(
      {
        error:
          maxStores === 1
            ? `The ${subscription?.plan.name} plan includes 1 branch. Upgrade to add more branches.`
            : `You've reached the ${maxStores}-branch limit for the ${subscription?.plan.name} plan. Upgrade to add more.`,
      },
      { status: 403 }
    );
  }

  const taken = new Set(existingCodes.map((s) => s.code));
  let n = existingCodes.length + 1;
  while (taken.has(`BR${n}`)) n += 1;

  const store = await prisma.store.create({
    data: { tenantId: session.tenantId, name, code: `BR${n}`, address: address || null, city: city || null },
  });
  return NextResponse.json(store, { status: 201 });
}
