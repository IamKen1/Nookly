import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/session";
import { hasPermission } from "@/lib/permissions";
import { serializeDiscount } from "@/lib/discounts";
import { parseDiscountBody } from "@/lib/discount-input";

async function authorize(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (!(await hasPermission(session.tenantId, session.role, "settings"))) {
    return { response: NextResponse.json({ error: "You don't have permission to change discounts." }, { status: 403 }) };
  }
  return { session };
}

// SC/PWD are set by law and stay as they are.
const LOCKED = "Senior citizen and PWD discounts are set by law (20%, VAT-exempt) and can't be changed.";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, response } = await authorize(request);
  if (!session) return response;
  const { id } = await params;
  const existing = await prisma.discount.findFirst({ where: { id, tenantId: session.tenantId } });
  if (!existing) return NextResponse.json({ error: "Discount not found." }, { status: 404 });
  if (existing.isSystem) return NextResponse.json({ error: LOCKED }, { status: 400 });

  const body = await request.json();
  // Turning a discount on or off on its own.
  if (Object.keys(body).length === 1 && "isActive" in body) {
    const updated = await prisma.discount.update({ where: { id }, data: { isActive: Boolean(body.isActive) } });
    return NextResponse.json(serializeDiscount(updated));
  }
  const parsed = await parseDiscountBody(session.tenantId, body);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  // The code stays the same so past sales and reports keep matching.
  const updated = await prisma.discount.update({ where: { id }, data: parsed.data });
  return NextResponse.json(serializeDiscount(updated));
}

// Deletes an unused discount; one already on sales is switched off instead so
// its history stays intact.
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, response } = await authorize(request);
  if (!session) return response;
  const { id } = await params;
  const existing = await prisma.discount.findFirst({ where: { id, tenantId: session.tenantId } });
  if (!existing) return NextResponse.json({ error: "Discount not found." }, { status: 404 });
  if (existing.isSystem) return NextResponse.json({ error: LOCKED }, { status: 400 });

  const used = await prisma.sale.count({ where: { tenantId: session.tenantId, OR: [{ discountId: id }, { discountType: existing.code }] } });
  if (used > 0) {
    await prisma.discount.update({ where: { id }, data: { isActive: false } });
    return NextResponse.json({ archived: true, message: `Used on ${used} sale${used === 1 ? "" : "s"}, so it was turned off instead of deleted.` });
  }
  await prisma.discount.delete({ where: { id } });
  return NextResponse.json({ deleted: true });
}
