import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/session";
import { ADMIN_UNLOCK_COOKIE, isPlatformAdmin, logAdminAction } from "@/lib/platform-admin";

export async function POST(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = await isPlatformAdmin(session);
  if (admin.ok) {
    await logAdminAction({
      actorUserId: session.userId,
      actorEmail: admin.email || "unknown",
      action: "lock_console",
    });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.delete(ADMIN_UNLOCK_COOKIE);
  return response;
}
