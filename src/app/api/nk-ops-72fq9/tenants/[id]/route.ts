import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/session";
import { requireAdminAccessRequest, logAdminAction } from "@/lib/platform-admin";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const access = await requireAdminAccessRequest(request, session);
  if (!access.ok) return NextResponse.json({ error: "Forbidden", reason: access.reason }, { status: 403 });

  const { id } = await params;
  const { action } = (await request.json()) as { action: "suspend" | "reactivate" };

  const tenant = await prisma.tenant.findUnique({ where: { id } });
  if (!tenant) return NextResponse.json({ error: "Tenant not found." }, { status: 404 });

  if (action !== "suspend" && action !== "reactivate") {
    return NextResponse.json({ error: "Invalid action." }, { status: 400 });
  }

  const updated = await prisma.tenant.update({ where: { id }, data: { isActive: action === "reactivate" } });

  await logAdminAction({
    actorUserId: session.userId,
    actorEmail: access.email || "unknown",
    action: action === "suspend" ? "suspend_tenant" : "reactivate_tenant",
    targetType: "Tenant",
    targetId: id,
    metadata: { tenantName: tenant.name, tenantSlug: tenant.slug },
  });

  return NextResponse.json({ id: updated.id, isActive: updated.isActive });
}
