import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession, SESSION_COOKIE_NAME } from "@/lib/auth";
import { ADMIN_RETURN_COOKIE, logAdminAction } from "@/lib/platform-admin";

export async function POST(request: NextRequest) {
  const returnToken = request.cookies.get(ADMIN_RETURN_COOKIE)?.value;
  if (!returnToken) return NextResponse.json({ error: "Not currently impersonating." }, { status: 400 });

  const restoredSession = verifySession(returnToken);
  if (!restoredSession) {
    const response = NextResponse.json({ error: "Your admin session expired — please log in again." }, { status: 401 });
    response.cookies.delete(ADMIN_RETURN_COOKIE);
    return response;
  }

  const adminUser = await prisma.user.findUnique({ where: { id: restoredSession.userId }, select: { email: true } });
  await logAdminAction({
    actorUserId: restoredSession.userId,
    actorEmail: adminUser?.email || "unknown",
    action: "stop_impersonate",
  });

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE_NAME, returnToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
  response.cookies.delete(ADMIN_RETURN_COOKIE);
  return response;
}
