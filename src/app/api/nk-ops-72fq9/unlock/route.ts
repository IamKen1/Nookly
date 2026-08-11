import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/session";
import {
  isPlatformAdmin,
  isAdminAccessKeyConfigured,
  verifyAdminAccessKey,
  signAdminUnlockToken,
  ADMIN_UNLOCK_COOKIE,
  logAdminAction,
} from "@/lib/platform-admin";

export async function POST(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = await isPlatformAdmin(session);
  if (!admin.ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (!isAdminAccessKeyConfigured()) {
    return NextResponse.json({ error: "The ops console is not configured on this environment." }, { status: 503 });
  }

  const { passphrase } = await request.json();
  if (!verifyAdminAccessKey(passphrase || "")) {
    await logAdminAction({
      actorUserId: session.userId,
      actorEmail: admin.email || "unknown",
      action: "unlock_failed",
    });
    return NextResponse.json({ error: "Incorrect passphrase." }, { status: 401 });
  }

  await logAdminAction({ actorUserId: session.userId, actorEmail: admin.email || "unknown", action: "unlock_success" });

  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_UNLOCK_COOKIE, signAdminUnlockToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  return response;
}
