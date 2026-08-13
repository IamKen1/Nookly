import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/session";
import { requireAdminAccessRequest, logAdminAction } from "@/lib/platform-admin";
import { sanitizeSupportAttachments } from "@/lib/support-attachments";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const access = await requireAdminAccessRequest(request, session);
  if (!access.ok) return NextResponse.json({ error: "Forbidden", reason: access.reason }, { status: 403 });

  const { id } = await params;
  const ticket = await prisma.supportTicket.findUnique({ where: { id } });
  if (!ticket) return NextResponse.json({ error: "Ticket not found." }, { status: 404 });

  const { message, attachments }: { message: string; attachments?: string[] } = await request.json();
  if (!message?.trim()) return NextResponse.json({ error: "Message is required." }, { status: 400 });

  const [reply] = await prisma.$transaction([
    prisma.supportTicketMessage.create({
      data: {
        ticketId: id,
        authorType: "ADMIN",
        authorUserId: session.userId,
        authorEmail: access.email || "unknown",
        body: message.trim(),
        attachments: sanitizeSupportAttachments(attachments),
      },
    }),
    prisma.supportTicket.update({
      where: { id },
      data: { updatedAt: new Date(), status: ticket.status === "OPEN" ? "IN_PROGRESS" : ticket.status },
    }),
  ]);

  await logAdminAction({
    actorUserId: session.userId,
    actorEmail: access.email || "unknown",
    action: "support_ticket_replied",
    targetType: "SupportTicket",
    targetId: id,
    metadata: { subject: ticket.subject },
  });

  return NextResponse.json(reply, { status: 201 });
}
