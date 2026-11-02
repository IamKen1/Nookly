import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/session";

// Cash drawers (open shifts) at the user's branch — to choose which one a
// cash payment to a supplier comes out of. The user's own drawer is first.
export async function GET(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.storeId) return NextResponse.json([]);
  const shifts = await prisma.shift.findMany({
    where: { tenantId: session.tenantId, storeId: session.storeId, closedAt: null },
    select: { id: true, openedAt: true, userId: true, user: { select: { firstName: true, lastName: true } } },
    orderBy: { openedAt: "desc" },
  });
  return NextResponse.json(
    shifts
      .map((s) => ({ id: s.id, cashier: `${s.user.firstName} ${s.user.lastName}`.trim(), openedAt: s.openedAt.toISOString(), mine: s.userId === session.userId }))
      .sort((a, b) => Number(b.mine) - Number(a.mine))
  );
}
