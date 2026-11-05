import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/session";
import { invalidateCached } from "@/lib/route-cache";
import { hasPermission } from "@/lib/permissions";
import { requireProductCapacity } from "@/lib/plan-gating";

// Brings an archived product back, with the stock it had. It counts toward the
// plan's product limit again, so the limit is checked as for a new product.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasPermission(session.tenantId, session.role, "products_edit"))) {
    return NextResponse.json({ error: "You don't have permission to edit products." }, { status: 403 });
  }

  const { id } = await params;
  const existing = await prisma.product.findFirst({ where: { id, tenantId: session.tenantId }, select: { isActive: true } });
  if (!existing) return NextResponse.json({ error: "Product not found." }, { status: 404 });
  if (existing.isActive) return NextResponse.json({ ok: true });

  const capacity = await requireProductCapacity(session.tenantId);
  if (!capacity.ok) return NextResponse.json({ error: capacity.error }, { status: capacity.status });

  await prisma.product.update({ where: { id }, data: { isActive: true } });
  invalidateCached(`products:${session.tenantId}`);
  return NextResponse.json({ ok: true });
}
