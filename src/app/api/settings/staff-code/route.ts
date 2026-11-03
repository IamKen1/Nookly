import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/session";
import { hasPermission } from "@/lib/permissions";
import { staffCodeAvailable } from "@/lib/staff-code";

// Settings › User access: "Require a security code". Offered only when the
// plan includes it and the workspace has more than one branch.
export async function GET(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const available = await staffCodeAvailable(session.tenantId);
  if (!available) return NextResponse.json({ available: false, enabled: false, usersWithoutCode: 0 });
  const [tenant, usersWithoutCode] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: session.tenantId }, select: { requireStaffCode: true } }),
    prisma.user.count({ where: { tenantId: session.tenantId, isActive: true, staffCodeHash: null } }),
  ]);
  return NextResponse.json({ available: true, enabled: Boolean(tenant?.requireStaffCode), usersWithoutCode });
}

export async function PATCH(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "OWNER" && session.role !== "ADMIN") {
    return NextResponse.json({ error: "Only an owner or admin can change this." }, { status: 403 });
  }
  if (!(await hasPermission(session.tenantId, session.role, "settings"))) {
    return NextResponse.json({ error: "You don't have access to Settings." }, { status: 403 });
  }
  if (!(await staffCodeAvailable(session.tenantId))) {
    return NextResponse.json({ error: "Security codes are part of the Empire plan for workspaces with more than one branch." }, { status: 403 });
  }
  const { enabled } = (await request.json()) as { enabled?: boolean };
  if (typeof enabled !== "boolean") return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  await prisma.tenant.update({ where: { id: session.tenantId }, data: { requireStaffCode: enabled } });
  return NextResponse.json({ ok: true, enabled });
}
