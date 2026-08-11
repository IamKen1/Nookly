import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/session";
import { requireAdminAccessRequest } from "@/lib/platform-admin";

export async function GET(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const access = await requireAdminAccessRequest(request, session);
  if (!access.ok) return NextResponse.json({ error: "Forbidden", reason: access.reason }, { status: 403 });

  const tickets = await prisma.supportTicket.findMany({
    include: {
      tenant: { select: { id: true, name: true, slug: true, ownerEmail: true } },
      createdByUser: { select: { firstName: true, lastName: true, email: true } },
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
    },
    orderBy: { updatedAt: "desc" },
    take: 300,
  });

  return NextResponse.json(
    tickets.map((t) => ({
      id: t.id,
      subject: t.subject,
      status: t.status,
      priority: t.priority,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
      tenant: t.tenant,
      createdByUser: t.createdByUser,
      lastMessage: t.messages[0]
        ? { authorType: t.messages[0].authorType, body: t.messages[0].body, createdAt: t.messages[0].createdAt.toISOString() }
        : null,
      awaitingReply: t.messages[0]?.authorType === "TENANT" && (t.status === "OPEN" || t.status === "IN_PROGRESS"),
    }))
  );
}
