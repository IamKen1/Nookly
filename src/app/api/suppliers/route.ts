import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/session";
import { hasPermission } from "@/lib/permissions";

export async function GET(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasPermission(session.tenantId, session.role, "inventory"))) {
    return NextResponse.json({ error: "You don't have access to Inventory." }, { status: 403 });
  }

  const suppliers = await prisma.supplier.findMany({
    where: { tenantId: session.tenantId, isActive: true },
    select: { id: true, name: true, phone: true },
    orderBy: { name: "asc" },
  });
  return NextResponse.json(suppliers);
}

// Adds a supplier (e.g. typed in while receiving a batch). Re-adding an
// existing name, in any letter case, returns the existing supplier.
export async function POST(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasPermission(session.tenantId, session.role, "inventory_adjust"))) {
    return NextResponse.json({ error: "You don't have permission to change stock." }, { status: 403 });
  }

  const body = await request.json();
  const name = typeof body.name === "string" ? body.name.trim().replace(/\s+/g, " ") : "";
  const phone = typeof body.phone === "string" ? body.phone.trim() : "";
  if (!name) return NextResponse.json({ error: "Supplier name is required." }, { status: 400 });

  const existing = await prisma.supplier.findFirst({
    where: { tenantId: session.tenantId, name: { equals: name, mode: "insensitive" } },
    select: { id: true, name: true, phone: true, isActive: true },
  });
  if (existing) {
    if (!existing.isActive) await prisma.supplier.update({ where: { id: existing.id }, data: { isActive: true } });
    return NextResponse.json({ id: existing.id, name: existing.name, phone: existing.phone });
  }

  const supplier = await prisma.supplier.create({
    data: { tenantId: session.tenantId, name, phone: phone || null },
    select: { id: true, name: true, phone: true },
  });
  return NextResponse.json(supplier, { status: 201 });
}
