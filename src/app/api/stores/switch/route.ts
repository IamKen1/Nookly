import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/session";
import { signSession, SESSION_COOKIE_NAME } from "@/lib/auth";
import { canManageAllBranches } from "@/lib/branch-scope";

// Changes which branch an owner/admin is working in. The session token is
// re-issued with the new storeId and the same expiry as before, so switching
// never extends (or shortens) how long they stay logged in.
export async function POST(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageAllBranches(session.role)) {
    return NextResponse.json({ error: "Only owners and admins can switch branches." }, { status: 403 });
  }

  const { storeId } = (await request.json()) as { storeId?: string };
  const store = storeId
    ? await prisma.store.findFirst({ where: { id: storeId, tenantId: session.tenantId, isActive: true }, select: { id: true, name: true } })
    : null;
  if (!store) return NextResponse.json({ error: "Branch not found." }, { status: 404 });

  const { exp } = session as typeof session & { exp?: number };
  const remainingSeconds = exp ? exp - Math.floor(Date.now() / 1000) : 0;
  if (remainingSeconds <= 0) return NextResponse.json({ error: "Session expired. Please log in again." }, { status: 401 });

  const token = signSession(
    { userId: session.userId, tenantId: session.tenantId, storeId: store.id, role: session.role, tenantSlug: session.tenantSlug },
    remainingSeconds
  );

  const response = NextResponse.json({ storeId: store.id, name: store.name });
  // A remembered login (30 days) keeps a persistent cookie; a normal 1-day
  // login stays a browser-session cookie, matching how /api/auth/login set it.
  const remembered = remainingSeconds > 60 * 60 * 24;
  response.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    ...(remembered ? { maxAge: remainingSeconds } : {}),
  });
  return response;
}
