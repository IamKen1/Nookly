import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/session";

export async function GET(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search")?.trim();
  // Every word must match the first name, last name or phone, so a full name
  // like "Juan Dela Cruz" finds Juan whose last name is Dela Cruz.
  const words = search ? search.split(/\s+/).filter(Boolean).slice(0, 5) : [];

  const customers = await prisma.customer.findMany({
    where: {
      tenantId: session.tenantId,
      isActive: true,
      ...(words.length
        ? {
            AND: words.map((w) => ({
              OR: [
                { firstName: { contains: w, mode: "insensitive" as const } },
                { lastName: { contains: w, mode: "insensitive" as const } },
                { phone: { contains: w } },
              ],
            })),
          }
        : {}),
    },
    orderBy: { lastName: "asc" },
    take: 50,
  });

  return NextResponse.json(customers);
}

export async function POST(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { firstName, lastName, phone, email } = body;

  if (!firstName || !lastName) {
    return NextResponse.json({ error: "firstName and lastName are required." }, { status: 400 });
  }

  const customer = await prisma.customer.create({
    data: { tenantId: session.tenantId, firstName, lastName, phone: phone || null, email: email || null },
  });

  return NextResponse.json(customer, { status: 201 });
}
