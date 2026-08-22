import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/session";
import { hasPermission } from "@/lib/permissions";

export async function GET(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.storeId) return NextResponse.json({ error: "No branch assigned to this account." }, { status: 400 });

  const { searchParams } = new URL(request.url);
  const mine = searchParams.get("mine") === "true";

  if (mine) {
    const openShift = await prisma.shift.findFirst({
      where: { tenantId: session.tenantId, storeId: session.storeId, userId: session.userId, closedAt: null },
      orderBy: { openedAt: "desc" },
    });
    const lastClosed = openShift
      ? null
      : await prisma.shift.findFirst({
          where: { tenantId: session.tenantId, storeId: session.storeId, closedAt: { not: null } },
          orderBy: { closedAt: "desc" },
        });

    return NextResponse.json({
      openShift: openShift
        ? {
            id: openShift.id,
            openedAt: openShift.openedAt.toISOString(),
            startingCash: Number(openShift.startingCash),
          }
        : null,
      suggestedStartingCash: lastClosed ? Number(lastClosed.endingCash ?? lastClosed.expectedCash ?? 0) : 0,
      lastClosedAt: lastClosed?.closedAt?.toISOString() ?? null,
    });
  }

  if (!(await hasPermission(session.tenantId, session.role, "shifts"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const shifts = await prisma.shift.findMany({
    where: { tenantId: session.tenantId, storeId: session.storeId },
    include: { user: { select: { firstName: true, lastName: true } } },
    orderBy: { openedAt: "desc" },
    take: 100,
  });

  return NextResponse.json(
    shifts.map((s) => ({
      id: s.id,
      openedAt: s.openedAt.toISOString(),
      closedAt: s.closedAt?.toISOString() ?? null,
      startingCash: Number(s.startingCash),
      endingCash: s.endingCash != null ? Number(s.endingCash) : null,
      expectedCash: s.expectedCash != null ? Number(s.expectedCash) : null,
      cashierName: `${s.user.firstName} ${s.user.lastName}`.trim(),
    }))
  );
}

export async function POST(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.storeId) return NextResponse.json({ error: "No branch assigned to this account." }, { status: 400 });

  const existing = await prisma.shift.findFirst({
    where: { tenantId: session.tenantId, storeId: session.storeId, userId: session.userId, closedAt: null },
  });
  if (existing) {
    return NextResponse.json({ error: "You already have an open shift." }, { status: 409 });
  }

  const { startingCash }: { startingCash: number } = await request.json();
  if (startingCash == null || startingCash < 0) {
    return NextResponse.json({ error: "A valid starting cash amount is required." }, { status: 400 });
  }

  const shift = await prisma.shift.create({
    data: {
      tenantId: session.tenantId,
      storeId: session.storeId,
      userId: session.userId,
      startingCash,
    },
  });

  return NextResponse.json({ id: shift.id, openedAt: shift.openedAt.toISOString(), startingCash: Number(shift.startingCash) }, { status: 201 });
}
