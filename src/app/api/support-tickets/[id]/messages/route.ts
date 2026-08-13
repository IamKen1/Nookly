import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/session";
import { sanitizeSupportAttachments } from "@/lib/support-attachments";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const ticket = await prisma.supportTicket.findFirst({ where: { id, tenantId: session.tenantId } });
  if (!ticket) return NextResponse.json({ error: "Ticket not found." }, { status: 404 });
  if (ticket.status === "CLOSED") {
    return NextResponse.json({ error: "This ticket is closed." }, { status: 400 });
  }

  const { message, attachments }: { message: string; attachments?: string[] } = await request.json();
  if (!message?.trim()) return NextResponse.json({ error: "Message is required." }, { status: 400 });

  const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { email: true } });
  if (!user) return NextResponse.json({ error: "User not found." }, { status: 400 });

  const [reply] = await prisma.$transaction([
    prisma.supportTicketMessage.create({
      data: {
        ticketId: id,
        authorType: "TENANT",
        authorUserId: session.userId,
        authorEmail: user.email,
        body: message.trim(),
        attachments: sanitizeSupportAttachments(attachments, session.tenantId),
      },
    }),
    prisma.supportTicket.update({
      where: { id },
      data: { updatedAt: new Date(), status: ticket.status === "RESOLVED" ? "OPEN" : ticket.status },
    }),
  ]);

  return NextResponse.json(reply, { status: 201 });
}
