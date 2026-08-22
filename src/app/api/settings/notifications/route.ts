import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/session";
import { requireFeature } from "@/lib/plan-gating";
import { getNotificationSettings, updateNotificationSettings } from "@/lib/notification-settings";
import { hasPermission } from "@/lib/permissions";

export async function GET(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const gate = await requireFeature(session.tenantId, "alerts");
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const settings = await getNotificationSettings(session.tenantId);
  return NextResponse.json(settings);
}

export async function PATCH(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasPermission(session.tenantId, session.role, "settings"))) {
    return NextResponse.json({ error: "You don't have permission to update notification settings." }, { status: 403 });
  }

  const gate = await requireFeature(session.tenantId, "alerts");
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const body = await request.json();
  const settings = await updateNotificationSettings(session.tenantId, body);
  return NextResponse.json(settings);
}
