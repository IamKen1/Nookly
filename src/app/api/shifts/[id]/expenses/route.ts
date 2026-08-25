import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/session";
import { hasPermission } from "@/lib/permissions";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const shift = await prisma.shift.findFirst({ where: { id, tenantId: session.tenantId } });
  if (!shift) return NextResponse.json({ error: "Shift not found." }, { status: 404 });
  if (shift.userId !== session.userId && !(await hasPermission(session.tenantId, session.role, "shifts"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const expenses = await prisma.shiftExpense.findMany({ where: { shiftId: id }, orderBy: { createdAt: "asc" } });
  return NextResponse.json(
    expenses.map((e) => ({ id: e.id, description: e.description, amount: Number(e.amount), createdAt: e.createdAt.toISOString() }))
  );
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const shift = await prisma.shift.findFirst({ where: { id, tenantId: session.tenantId } });
  if (!shift) return NextResponse.json({ error: "Shift not found." }, { status: 404 });
  if (shift.userId !== session.userId && !(await hasPermission(session.tenantId, session.role, "shifts"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (shift.closedAt) {
    return NextResponse.json({ error: "This shift is already closed." }, { status: 400 });
  }

  const { description, amount }: { description?: string; amount?: number } = await request.json();
  if (!description?.trim()) {
    return NextResponse.json({ error: "Enter what the expense was for." }, { status: 400 });
  }
  if (amount == null || !Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "Enter a valid amount." }, { status: 400 });
  }

  const expense = await prisma.shiftExpense.create({
    data: { tenantId: session.tenantId, shiftId: id, description: description.trim(), amount },
  });

  return NextResponse.json(
    { id: expense.id, description: expense.description, amount: Number(expense.amount), createdAt: expense.createdAt.toISOString() },
    { status: 201 }
  );
}
