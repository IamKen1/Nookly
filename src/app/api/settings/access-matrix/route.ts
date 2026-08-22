import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/session";
import { getPermissionMatrix, setPermissionMatrix, PERMISSION_MODULES, isConfigurableRole, type PermissionMatrix } from "@/lib/permissions";

export async function GET(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Only the owner can view/change who has access to what — an ADMIN
  // editing this could otherwise grant themselves more power.
  if (session.role !== "OWNER") {
    return NextResponse.json({ error: "Only the workspace owner can manage user access." }, { status: 403 });
  }

  const matrix = await getPermissionMatrix(session.tenantId);
  return NextResponse.json(matrix);
}

export async function PATCH(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "OWNER") {
    return NextResponse.json({ error: "Only the workspace owner can manage user access." }, { status: 403 });
  }

  const body = (await request.json()) as PermissionMatrix;
  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const moduleKeys = new Set(PERMISSION_MODULES.map((m) => m.key));
  for (const [role, modules] of Object.entries(body)) {
    if (!isConfigurableRole(role)) {
      return NextResponse.json({ error: `Invalid role: ${role}` }, { status: 400 });
    }
    if (typeof modules !== "object" || modules === null) {
      return NextResponse.json({ error: `Invalid permissions for role: ${role}` }, { status: 400 });
    }
    for (const key of Object.keys(modules)) {
      if (!moduleKeys.has(key as never)) {
        return NextResponse.json({ error: `Invalid module: ${key}` }, { status: 400 });
      }
    }
  }

  await setPermissionMatrix(session.tenantId, body);
  const matrix = await getPermissionMatrix(session.tenantId);
  return NextResponse.json(matrix);
}
