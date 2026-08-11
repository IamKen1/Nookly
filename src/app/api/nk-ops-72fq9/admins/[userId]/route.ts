import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/session";
import { requireAdminAccessRequest, logAdminAction, isEnvBootstrapAdmin } from "@/lib/platform-admin";

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const access = await requireAdminAccessRequest(request, session);
  if (!access.ok) return NextResponse.json({ error: "Forbidden", reason: access.reason }, { status: 403 });

  const { userId } = await params;
  const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true } });
  if (!target) return NextResponse.json({ error: "User not found." }, { status: 404 });

  if (isEnvBootstrapAdmin(target.email)) {
    return NextResponse.json(
      { error: "This admin is granted via PLATFORM_ADMIN_EMAILS — remove them from the env var instead." },
      { status: 400 }
    );
  }

  await prisma.user.update({ where: { id: userId }, data: { isPlatformAdmin: false } });

  await logAdminAction({
    actorUserId: session.userId,
    actorEmail: access.email || "unknown",
    action: "revoke_admin",
    targetType: "User",
    targetId: userId,
    metadata: { email: target.email },
  });

  return NextResponse.json({ ok: true });
}
