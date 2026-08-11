import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/session";
import { requireAdminAccessRequest, logAdminAction } from "@/lib/platform-admin";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const access = await requireAdminAccessRequest(request, session);
  if (!access.ok) return NextResponse.json({ error: "Forbidden", reason: access.reason }, { status: 403 });

  const { id } = await params;
  const ticket = await prisma.supportTicket.findUnique({
    where: { id },
    include: {
      tenant: { select: { id: true, name: true, slug: true, ownerEmail: true } },
      createdByUser: { select: { firstName: true, lastName: true, email: true } },
      messages: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!ticket) return NextResponse.json({ error: "Ticket not found." }, { status: 404 });

  return NextResponse.json(ticket);
}

const VALID_STATUSES = ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"];

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const access = await requireAdminAccessRequest(request, session);
  if (!access.ok) return NextResponse.json({ error: "Forbidden", reason: access.reason }, { status: 403 });

  const { id } = await params;
  const { status }: { status: string } = await request.json();
  if (!VALID_STATUSES.includes(status)) return NextResponse.json({ error: "Invalid status." }, { status: 400 });

  const ticket = await prisma.supportTicket.findUnique({ where: { id } });
  if (!ticket) return NextResponse.json({ error: "Ticket not found." }, { status: 404 });

  const updated = await prisma.supportTicket.update({ where: { id }, data: { status: status as never } });

  await logAdminAction({
    actorUserId: session.userId,
    actorEmail: access.email || "unknown",
    action: "support_ticket_status_changed",
    targetType: "SupportTicket",
    targetId: id,
    metadata: { subject: ticket.subject, from: ticket.status, to: status },
  });

  return NextResponse.json(updated);
}
