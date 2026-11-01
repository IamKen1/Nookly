import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/session";
import { hasPermission } from "@/lib/permissions";

// Removes a held cart — after it's loaded back into the POS, or when it's no
// longer needed. Only carts held at the user's branch.
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasPermission(session.tenantId, session.role, "pos"))) {
    return NextResponse.json({ error: "You don't have access to the POS." }, { status: 403 });
  }
  const { id } = await params;
  const { count } = await prisma.heldCart.deleteMany({ where: { id, tenantId: session.tenantId, storeId: session.storeId ?? "__none" } });
  if (count === 0) return NextResponse.json({ error: "That held cart is no longer there." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
