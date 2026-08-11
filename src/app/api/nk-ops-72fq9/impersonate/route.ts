import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/session";
import { SESSION_COOKIE_NAME, SESSION_DURATION, signSession } from "@/lib/auth";
import { requireAdminAccessRequest, logAdminAction, ADMIN_RETURN_COOKIE } from "@/lib/platform-admin";

export async function POST(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const access = await requireAdminAccessRequest(request, session);
  if (!access.ok) return NextResponse.json({ error: "Forbidden", reason: access.reason }, { status: 403 });

  const { tenantId } = await request.json();
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) return NextResponse.json({ error: "Tenant not found." }, { status: 404 });

  const owner = await prisma.user.findFirst({
    where: { tenantId, role: "OWNER", isActive: true },
    orderBy: { createdAt: "asc" },
  });
  if (!owner) return NextResponse.json({ error: "This tenant has no active owner account to impersonate." }, { status: 400 });

  const currentToken = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!currentToken) return NextResponse.json({ error: "Missing current session." }, { status: 400 });

  const impersonationToken = signSession(
    { userId: owner.id, tenantId: owner.tenantId, storeId: owner.storeId, role: owner.role, tenantSlug: tenant.slug },
    SESSION_DURATION.short.expiresIn
  );

  await logAdminAction({
    actorUserId: session.userId,
    actorEmail: access.email || "unknown",
    action: "impersonate_tenant",
    targetType: "Tenant",
    targetId: tenantId,
    metadata: { tenantName: tenant.name, tenantSlug: tenant.slug, impersonatedUserEmail: owner.email },
  });

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE_NAME, impersonationToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
  response.cookies.set(ADMIN_RETURN_COOKIE, currentToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24,
  });
  return response;
}
