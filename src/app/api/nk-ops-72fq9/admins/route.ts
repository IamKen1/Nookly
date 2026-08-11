import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/session";
import { requireAdminAccessRequest, logAdminAction, isEnvBootstrapAdmin } from "@/lib/platform-admin";

const ENV_ADMIN_EMAILS = (process.env.PLATFORM_ADMIN_EMAILS || "")
  .split(",")
  .map((e) => e.trim())
  .filter(Boolean);

export async function GET(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const access = await requireAdminAccessRequest(request, session);
  if (!access.ok) return NextResponse.json({ error: "Forbidden", reason: access.reason }, { status: 403 });

  const dbAdmins = await prisma.user.findMany({
    where: { isPlatformAdmin: true },
    select: { id: true, email: true, firstName: true, lastName: true, tenant: { select: { name: true, slug: true } } },
  });

  const byEmail = new Map(dbAdmins.map((u) => [u.email.toLowerCase(), u]));
  const rows = dbAdmins.map((u) => ({
    userId: u.id,
    email: u.email,
    name: `${u.firstName} ${u.lastName}`.trim(),
    tenantName: u.tenant.name,
    tenantSlug: u.tenant.slug,
    envProtected: isEnvBootstrapAdmin(u.email),
  }));

  for (const envEmail of ENV_ADMIN_EMAILS) {
    if (byEmail.has(envEmail.toLowerCase())) continue;
    const match = await prisma.user.findFirst({
      where: { email: { equals: envEmail, mode: "insensitive" } },
      select: { id: true, email: true, firstName: true, lastName: true, tenant: { select: { name: true, slug: true } } },
    });
    rows.push({
      userId: match?.id ?? "",
      email: envEmail,
      name: match ? `${match.firstName} ${match.lastName}`.trim() : "(no matching account)",
      tenantName: match?.tenant.name ?? "—",
      tenantSlug: match?.tenant.slug ?? "—",
      envProtected: true,
    });
  }

  return NextResponse.json(rows);
}

export async function POST(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const access = await requireAdminAccessRequest(request, session);
  if (!access.ok) return NextResponse.json({ error: "Forbidden", reason: access.reason }, { status: 403 });

  const { tenantSlug, identifier } = await request.json();
  if (!tenantSlug || !identifier) {
    return NextResponse.json({ error: "tenantSlug and identifier (email or username) are required." }, { status: 400 });
  }

  const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
  if (!tenant) return NextResponse.json({ error: "Tenant not found." }, { status: 404 });

  const user = await prisma.user.findFirst({
    where: { tenantId: tenant.id, OR: [{ email: identifier }, { username: identifier }] },
  });
  if (!user) return NextResponse.json({ error: "No matching user in that tenant." }, { status: 404 });

  const updated = await prisma.user.update({ where: { id: user.id }, data: { isPlatformAdmin: true } });

  await logAdminAction({
    actorUserId: session.userId,
    actorEmail: access.email || "unknown",
    action: "grant_admin",
    targetType: "User",
    targetId: user.id,
    metadata: { email: user.email, tenantSlug },
  });

  return NextResponse.json({ userId: updated.id, email: updated.email });
}
