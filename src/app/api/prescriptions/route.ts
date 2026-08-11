import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/session";
import { requireFeature } from "@/lib/plan-gating";

interface PrescriptionItemInput {
  productId: string;
  quantity: number;
  instructions?: string;
}

export async function GET(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const gate = await requireFeature(session.tenantId, "prescriptions");
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const customerId = searchParams.get("customerId");

  const prescriptions = await prisma.prescription.findMany({
    where: {
      tenantId: session.tenantId,
      ...(status ? { status: status as never } : {}),
      ...(customerId ? { customerId } : {}),
    },
    include: {
      customer: { select: { id: true, firstName: true, lastName: true } },
      doctor: { select: { id: true, firstName: true, lastName: true, licenseNumber: true } },
      items: { include: { product: { select: { id: true, name: true, requiresPrescription: true } } } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return NextResponse.json(prescriptions);
}

export async function POST(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const gate = await requireFeature(session.tenantId, "prescriptions");
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const body = await request.json();
  const {
    customerId,
    doctorId,
    originalDate,
    writtenDate,
    instructions,
    refillsAllowed,
    daysSupply,
    items,
  }: {
    customerId: string;
    doctorId: string;
    originalDate: string;
    writtenDate: string;
    instructions?: string;
    refillsAllowed?: number;
    daysSupply?: number;
    items: PrescriptionItemInput[];
  } = body;

  if (!customerId || !doctorId || !originalDate || !writtenDate) {
    return NextResponse.json({ error: "customerId, doctorId, originalDate and writtenDate are required." }, { status: 400 });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: "At least one prescription item is required." }, { status: 400 });
  }

  const [customer, doctor] = await Promise.all([
    prisma.customer.findFirst({ where: { id: customerId, tenantId: session.tenantId } }),
    prisma.doctor.findFirst({ where: { id: doctorId, tenantId: session.tenantId } }),
  ]);
  if (!customer) return NextResponse.json({ error: "Customer not found." }, { status: 400 });
  if (!doctor) return NextResponse.json({ error: "Doctor not found." }, { status: 400 });

  const now = new Date();
  const dateKey = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  const todayCount = await prisma.prescription.count({
    where: { tenantId: session.tenantId, createdAt: { gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()) } },
  });
  const prescriptionNumber = `RX-${dateKey}-${String(todayCount + 1).padStart(4, "0")}`;

  try {
    const prescription = await prisma.prescription.create({
      data: {
        tenantId: session.tenantId,
        prescriptionNumber,
        customerId,
        doctorId,
        originalDate: new Date(originalDate),
        writtenDate: new Date(writtenDate),
        instructions: instructions || null,
        refillsAllowed: refillsAllowed ?? 0,
        daysSupply: daysSupply ?? null,
        items: {
          create: items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            instructions: item.instructions || null,
          })),
        },
      },
      include: {
        customer: { select: { id: true, firstName: true, lastName: true } },
        doctor: { select: { id: true, firstName: true, lastName: true } },
        items: { include: { product: { select: { id: true, name: true } } } },
      },
    });

    return NextResponse.json(prescription, { status: 201 });
  } catch (error) {
    console.error("Error creating prescription", error);
    return NextResponse.json({ error: "Failed to create prescription." }, { status: 500 });
  }
}
