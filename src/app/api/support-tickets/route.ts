import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/session";
import { sanitizeSupportAttachments } from "@/lib/support-attachments";

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

  return NextResponse.json(ticket, { status: 201 });
}
