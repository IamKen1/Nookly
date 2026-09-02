import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/session";
import { requireFeature } from "@/lib/plan-gating";
import { hasPermission } from "@/lib/permissions";
import { revokeApiKey } from "@/lib/api-keys";

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasPermission(session.tenantId, session.role, "settings"))) {
    return NextResponse.json({ error: "You don't have permission to manage API keys." }, { status: 403 });
  }

  const gate = await requireFeature(session.tenantId, "apiAccess");
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const { id } = await params;
  const revoked = await revokeApiKey(session.tenantId, id);
  if (!revoked) return NextResponse.json({ error: "Key not found." }, { status: 404 });

  return NextResponse.json({ ok: true });
}
