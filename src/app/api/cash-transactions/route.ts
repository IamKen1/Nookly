import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/session";

const SUPERVISOR_ROLES = ["OWNER", "ADMIN", "MANAGER"];

export async function GET(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.storeId) return NextResponse.json({ error: "No branch assigned to this account." }, { status: 400 });

  const { searchParams } = new URL(request.url);
  const shiftId = searchParams.get("shiftId");
  const dateParam = searchParams.get("date");

  if (shiftId) {
    const shift = await prisma.shift.findFirst({ where: { id: shiftId, tenantId: session.tenantId } });
    if (!shift) return NextResponse.json({ error: "Shift not found." }, { status: 404 });
    if (shift.userId !== session.userId && !SUPERVISOR_ROLES.includes(session.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const transactions = await prisma.cashTransaction.findMany({ where: { shiftId }, orderBy: { createdAt: "desc" } });
    return NextResponse.json(transactions.map(serializeTransaction));
  }

  if (!SUPERVISOR_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const day = dateParam ? new Date(dateParam) : new Date();
  const start = new Date(day.getFullYear(), day.getMonth(), day.getDate());
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  const transactions = await prisma.cashTransaction.findMany({
    where: { tenantId: session.tenantId, storeId: session.storeId, createdAt: { gte: start, lt: end } },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(transactions.map(serializeTransaction));
}

function serializeTransaction(t: {
  id: string;
  type: string;
  provider: string;
  amount: unknown;
  serviceFee: unknown;
  referenceNumber: string | null;
  customerName: string | null;
  customerMobile: string | null;
  createdAt: Date;
}) {
  return {
    id: t.id,
    type: t.type,
    provider: t.provider,
    amount: Number(t.amount),
    serviceFee: Number(t.serviceFee),
    referenceNumber: t.referenceNumber,
    customerName: t.customerName,
    customerMobile: t.customerMobile,
    createdAt: t.createdAt.toISOString(),
  };
}

export async function POST(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.storeId) return NextResponse.json({ error: "No branch assigned to this account." }, { status: 400 });

  const body = await request.json();
  const {
    type,
    provider,
    amount,
    serviceFee,
    referenceNumber,
    customerName,
    customerMobile,
  }: {
    type: "CASH_IN" | "CASH_OUT" | "LOAD";
    provider: string;
    amount: number;
    serviceFee?: number;
    referenceNumber?: string;
    customerName?: string;
    customerMobile?: string;
  } = body;

  if (type !== "CASH_IN" && type !== "CASH_OUT" && type !== "LOAD") {
    return NextResponse.json({ error: "type must be CASH_IN, CASH_OUT, or LOAD." }, { status: 400 });
  }
  if (!provider?.trim()) {
    return NextResponse.json(
      { error: type === "LOAD" ? "Network (e.g. Globe, Smart) is required." : "Provider (e.g. GCash, Maya) is required." },
      { status: 400 }
    );
  }
  if (!amount || amount <= 0) {
    return NextResponse.json({ error: "A valid amount is required." }, { status: 400 });
  }
  if (type === "LOAD" && !customerMobile?.trim()) {
    return NextResponse.json({ error: "The mobile number to load is required." }, { status: 400 });
  }

  const openShift = await prisma.shift.findFirst({
    where: { tenantId: session.tenantId, storeId: session.storeId, userId: session.userId, closedAt: null },
    select: { id: true },
  });

  const created = await prisma.cashTransaction.create({
    data: {
      tenantId: session.tenantId,
      storeId: session.storeId,
      shiftId: openShift?.id ?? null,
      userId: session.userId,
      type,
      provider: provider.trim(),
      amount,
      serviceFee: serviceFee ?? 0,
      referenceNumber: referenceNumber?.trim() || null,
      customerName: customerName?.trim() || null,
      customerMobile: customerMobile?.trim() || null,
    },
  });

  return NextResponse.json(serializeTransaction(created), { status: 201 });
}
