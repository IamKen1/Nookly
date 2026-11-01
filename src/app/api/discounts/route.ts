import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/session";
import { hasPermission } from "@/lib/permissions";
import { codeFromName, ensureDefaultDiscounts, isDiscountAvailable, serializeDiscount } from "@/lib/discounts";
import { parseDiscountBody } from "@/lib/discount-input";

// All discounts (Settings), or with ?forSale=1 only those the counter can use
// at the user's branch today.
export async function GET(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await ensureDefaultDiscounts(session.tenantId);
  const discounts = await prisma.discount.findMany({
    where: { tenantId: session.tenantId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  const forSale = new URL(request.url).searchParams.get("forSale") === "1";
  const list = forSale ? discounts.filter((d) => isDiscountAvailable(d, session.storeId)) : discounts;
  return NextResponse.json(list.map(serializeDiscount));
}

export async function POST(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasPermission(session.tenantId, session.role, "settings"))) {
    return NextResponse.json({ error: "You don't have permission to change discounts." }, { status: 403 });
  }

  const parsed = await parseDiscountBody(session.tenantId, await request.json());
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  // A unique code per workspace, from the name.
  const base = codeFromName(parsed.data.name);
  let code = base;
  for (let i = 2; await prisma.discount.findFirst({ where: { tenantId: session.tenantId, code }, select: { id: true } }); i++) {
    code = `${base.slice(0, 20)}_${i}`;
  }
  const last = await prisma.discount.findFirst({ where: { tenantId: session.tenantId }, orderBy: { sortOrder: "desc" }, select: { sortOrder: true } });

  const created = await prisma.discount.create({
    data: { ...parsed.data, tenantId: session.tenantId, code, sortOrder: (last?.sortOrder ?? 0) + 1 },
  });
  return NextResponse.json(serializeDiscount(created), { status: 201 });
}
