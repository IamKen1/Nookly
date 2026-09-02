import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/session";
import { requireFeature } from "@/lib/plan-gating";
import { hasPermission } from "@/lib/permissions";
import { listApiKeys, createApiKey } from "@/lib/api-keys";

export async function GET(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const gate = await requireFeature(session.tenantId, "apiAccess");
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const keys = await listApiKeys(session.tenantId);
  return NextResponse.json(keys);
}

export async function POST(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasPermission(session.tenantId, session.role, "settings"))) {
    return NextResponse.json({ error: "You don't have permission to manage API keys." }, { status: 403 });
  }

  const gate = await requireFeature(session.tenantId, "apiAccess");
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const body = await request.json();
  const name = typeof body?.name === "string" ? body.name : "";
  if (!name.trim()) return NextResponse.json({ error: "Name is required." }, { status: 400 });

  const result = await createApiKey(session.tenantId, session.userId, name);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  return NextResponse.json({ key: result.key, rawKey: result.rawKey }, { status: 201 });
}
