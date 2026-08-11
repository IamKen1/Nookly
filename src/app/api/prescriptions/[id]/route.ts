import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/session";
import { requireFeature } from "@/lib/plan-gating";

const VALID_STATUSES = ["PENDING", "FILLED", "PARTIAL", "CANCELLED", "EXPIRED"];

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const gate = await requireFeature(session.tenantId, "prescriptions");
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const { id } = await params;
  const prescription = await prisma.prescription.findFirst({
    where: { id, tenantId: session.tenantId },
    include: {
      customer: true,
      doctor: true,
      items: { include: { product: true } },
      sales: { select: { id: true, saleNumber: true, saleDate: true, totalAmount: true } },
    },
  });
  if (!prescription) return NextResponse.json({ error: "Prescription not found." }, { status: 404 });

  return NextResponse.json(prescription);
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const gate = await requireFeature(session.tenantId, "prescriptions");
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const { id } = await params;
  const existing = await prisma.prescription.findFirst({ where: { id, tenantId: session.tenantId } });
  if (!existing) return NextResponse.json({ error: "Prescription not found." }, { status: 404 });

  const body = await request.json();
  const { status, refillsUsed, instructions } = body;

  if (status !== undefined && !VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: "Invalid status." }, { status: 400 });
  }

  const prescription = await prisma.prescription.update({
    where: { id },
    data: {
      ...(status !== undefined ? { status } : {}),
      ...(refillsUsed !== undefined ? { refillsUsed } : {}),
      ...(instructions !== undefined ? { instructions } : {}),
    },
  });

  return NextResponse.json(prescription);
}
