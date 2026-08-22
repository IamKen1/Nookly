import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/session";
import { sanitizeSupportAttachments } from "@/lib/support-attachments";
import { sendAlertEmail } from "@/lib/email";
import { platformAdminRecipients } from "@/lib/platform-admin";
import { ADMIN_BASE_PATH } from "@/lib/admin-path";

export async function GET(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tickets = await prisma.supportTicket.findMany({
    where: { tenantId: session.tenantId },
    include: {
      messages: { orderBy: { createdAt: "asc" } },
      createdByUser: { select: { firstName: true, lastName: true, email: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json(tickets);
}

export async function POST(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { message, attachments }: { message: string; attachments?: string[] } = body;

  if (!message?.trim()) {
    return NextResponse.json({ error: "Message is required." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { email: true } });
  if (!user) return NextResponse.json({ error: "User not found." }, { status: 400 });

  const trimmed = message.trim();
  const subject = trimmed.length > 60 ? `${trimmed.slice(0, 60)}...` : trimmed;

  const ticket = await prisma.supportTicket.create({
    data: {
      tenantId: session.tenantId,
      subject,
      createdByUserId: session.userId,
      messages: {
        create: {
          authorType: "TENANT",
          authorUserId: session.userId,
          authorEmail: user.email,
          body: message.trim(),
          attachments: sanitizeSupportAttachments(attachments, session.tenantId),
        },
      },
    },
    include: { messages: true },
  });

  if (platformAdminRecipients.length > 0) {
    const tenant = await prisma.tenant.findUnique({ where: { id: session.tenantId }, select: { name: true } });
    const origin = new URL(request.url).origin;
    await sendAlertEmail({
      to: platformAdminRecipients,
      subject: `[Nookly Support] New ticket — ${tenant?.name ?? session.tenantSlug}`,
      text: [
        `Tenant: ${tenant?.name ?? session.tenantSlug}`,
        `From: ${user.email}`,
        `Subject: ${subject}`,
        "",
        trimmed,
        "",
        `Reply from the ops console: ${origin}/${ADMIN_BASE_PATH}`,
      ].join("\n"),
    }).catch((err) => console.error("Failed to send support-ticket notification:", err));
  }

  return NextResponse.json(ticket, { status: 201 });
}
