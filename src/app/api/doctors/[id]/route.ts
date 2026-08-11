import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/session";
import { requireFeature } from "@/lib/plan-gating";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const gate = await requireFeature(session.tenantId, "prescriptions");
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const { id } = await params;
  const existing = await prisma.doctor.findFirst({ where: { id, tenantId: session.tenantId } });
  if (!existing) return NextResponse.json({ error: "Doctor not found." }, { status: 404 });

  const body = await request.json();
  const { firstName, lastName, specialty, licenseNumber, deaNumber, npiNumber, phone, email, address, city, state, zipCode } = body;

  const doctor = await prisma.doctor.update({
    where: { id },
    data: {
      ...(firstName !== undefined ? { firstName } : {}),
      ...(lastName !== undefined ? { lastName } : {}),
      ...(specialty !== undefined ? { specialty } : {}),
      ...(licenseNumber !== undefined ? { licenseNumber } : {}),
      ...(deaNumber !== undefined ? { deaNumber } : {}),
      ...(npiNumber !== undefined ? { npiNumber } : {}),
      ...(phone !== undefined ? { phone } : {}),
      ...(email !== undefined ? { email } : {}),
      ...(address !== undefined ? { address } : {}),
      ...(city !== undefined ? { city } : {}),
      ...(state !== undefined ? { state } : {}),
      ...(zipCode !== undefined ? { zipCode } : {}),
    },
  });

  return NextResponse.json(doctor);
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const gate = await requireFeature(session.tenantId, "prescriptions");
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const { id } = await params;
  const existing = await prisma.doctor.findFirst({ where: { id, tenantId: session.tenantId } });
  if (!existing) return NextResponse.json({ error: "Doctor not found." }, { status: 404 });

  await prisma.doctor.update({ where: { id }, data: { isActive: false } });
  return NextResponse.json({ ok: true });
}
