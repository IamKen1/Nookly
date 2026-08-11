import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/session";
import { requireFeature } from "@/lib/plan-gating";

export async function GET(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const gate = await requireFeature(session.tenantId, "prescriptions");
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search")?.trim();

  const doctors = await prisma.doctor.findMany({
    where: {
      tenantId: session.tenantId,
      isActive: true,
      ...(search
        ? {
            OR: [
              { firstName: { contains: search, mode: "insensitive" } },
              { lastName: { contains: search, mode: "insensitive" } },
              { licenseNumber: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: { lastName: "asc" },
  });

  return NextResponse.json(doctors);
}

export async function POST(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const gate = await requireFeature(session.tenantId, "prescriptions");
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const body = await request.json();
  const { firstName, lastName, specialty, licenseNumber, deaNumber, npiNumber, phone, email, address, city, state, zipCode } = body;

  if (!firstName || !lastName) {
    return NextResponse.json({ error: "firstName and lastName are required." }, { status: 400 });
  }

  try {
    const doctor = await prisma.doctor.create({
      data: {
        tenantId: session.tenantId,
        firstName,
        lastName,
        specialty: specialty || null,
        licenseNumber: licenseNumber || null,
        deaNumber: deaNumber || null,
        npiNumber: npiNumber || null,
        phone: phone || null,
        email: email || null,
        address: address || null,
        city: city || null,
        state: state || null,
        zipCode: zipCode || null,
      },
    });
    return NextResponse.json(doctor, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "P2002") {
      return NextResponse.json({ error: "A doctor with this license number already exists." }, { status: 409 });
    }
    console.error("Error creating doctor", error);
    return NextResponse.json({ error: "Failed to create doctor." }, { status: 500 });
  }
}
