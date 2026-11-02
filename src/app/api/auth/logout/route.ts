import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/auth";
import { getSessionFromRequest } from "@/lib/session";
import { getRolePermissions } from "@/lib/permissions";
import { isShiftRequired } from "@/lib/permissions-shared";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  // Roles set to "Must start & end a shift" end their shift before logging out.
  const session = getSessionFromRequest(request);
  // The Upgrade screen (account locked, POS out of reach) may always log out.
  const force = Boolean((await request.json().catch(() => ({}))).force);
  if (session && !force && isShiftRequired(session.role, await getRolePermissions(session.tenantId, session.role))) {
    const open = await prisma.shift.findFirst({ where: { tenantId: session.tenantId, userId: session.userId, closedAt: null }, select: { id: true } });
    if (open) {
      return NextResponse.json({ error: "End your shift before logging out — count your drawer in the POS.", code: "SHIFT_OPEN" }, { status: 409 });
    }
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE_NAME, "", { path: "/", maxAge: 0 });
  return response;
}
