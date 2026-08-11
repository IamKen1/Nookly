import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/session";
import { getReceiptSettings, updateReceiptSettings } from "@/lib/receipt-settings";

const CAN_MANAGE_ROLES = ["OWNER", "ADMIN"];

export async function GET(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const settings = await getReceiptSettings(session.tenantId);
  return NextResponse.json(settings);
}

export async function PATCH(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!CAN_MANAGE_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "You don't have permission to update receipt settings." }, { status: 403 });
  }

  const body = await request.json();
  const settings = await updateReceiptSettings(session.tenantId, body);
  return NextResponse.json(settings);
}
