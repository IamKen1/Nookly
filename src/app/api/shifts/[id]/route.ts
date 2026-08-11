import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/session";
import { computeShiftReading } from "@/lib/shift-reading";

const SUPERVISOR_ROLES = ["OWNER", "ADMIN", "MANAGER"];

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const shift = await prisma.shift.findFirst({ where: { id, tenantId: session.tenantId } });
  if (!shift) return NextResponse.json({ error: "Shift not found." }, { status: 404 });
  if (shift.userId !== session.userId && !SUPERVISOR_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const reading = await computeShiftReading(id);
  return NextResponse.json(reading);
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const shift = await prisma.shift.findFirst({ where: { id, tenantId: session.tenantId } });
  if (!shift) return NextResponse.json({ error: "Shift not found." }, { status: 404 });
  if (shift.userId !== session.userId && !SUPERVISOR_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (shift.closedAt) {
    return NextResponse.json({ error: "This shift is already closed." }, { status: 400 });
  }

  const { endingCash, notes }: { endingCash: number; notes?: string } = await request.json();
  if (endingCash == null || endingCash < 0) {
    return NextResponse.json({ error: "A valid ending cash amount is required." }, { status: 400 });
  }

  const reading = await computeShiftReading(id);
  if (!reading) return NextResponse.json({ error: "Shift not found." }, { status: 404 });

  const updated = await prisma.shift.update({
    where: { id },
    data: {
      closedAt: new Date(),
      endingCash,
      expectedCash: reading.computedExpectedCash,
      notes: notes || null,
    },
  });

  return NextResponse.json({
    id: updated.id,
    closedAt: updated.closedAt!.toISOString(),
    startingCash: Number(updated.startingCash),
    endingCash: Number(updated.endingCash),
    expectedCash: Number(updated.expectedCash),
    variance: Number(updated.endingCash) - Number(updated.expectedCash),
    reading,
  });
}
