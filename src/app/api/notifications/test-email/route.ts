import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/session";
import { requireFeature } from "@/lib/plan-gating";
import { getAlertRecipients } from "@/lib/notification-settings";
import { isEmailNotificationConfigured, sendAlertEmail } from "@/lib/email";
import { hasPermission } from "@/lib/permissions";

export async function POST(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasPermission(session.tenantId, session.role, "settings"))) {
    return NextResponse.json({ error: "You don't have permission to send test emails." }, { status: 403 });
  }

  const gate = await requireFeature(session.tenantId, "alerts");
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  if (!isEmailNotificationConfigured()) {
    return NextResponse.json({ error: "SMTP is not configured. Set SMTP_HOST/PORT/USER/PASS in your environment." }, { status: 400 });
  }

  const recipients = await getAlertRecipients(session.tenantId);
  if (recipients.length === 0) {
    return NextResponse.json({ error: "No alert recipient emails configured." }, { status: 400 });
  }

  await sendAlertEmail({
    to: recipients,
    subject: "[Nookly] Test email",
    text: "This is a test email from your Nookly notification settings.",
    html: "<p>This is a test email from your Nookly notification settings.</p>",
  });

  return NextResponse.json({ ok: true, sentTo: recipients });
}
