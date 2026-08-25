import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/session";
import { hasPermission } from "@/lib/permissions";

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string; expenseId: string }> }) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, expenseId } = await params;
  const shift = await prisma.shift.findFirst({ where: { id, tenantId: session.tenantId } });
  if (!shift) return NextResponse.json({ error: "Shift not found." }, { status: 404 });
  if (shift.userId !== session.userId && !(await hasPermission(session.tenantId, session.role, "shifts"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (shift.closedAt) {
    return NextResponse.json({ error: "This shift is already closed." }, { status: 400 });
  }

  const deleted = await prisma.shiftExpense.deleteMany({ where: { id: expenseId, shiftId: id } });
  if (deleted.count === 0) return NextResponse.json({ error: "Expense not found." }, { status: 404 });

  return NextResponse.json({ ok: true });
}
