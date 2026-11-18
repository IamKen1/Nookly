import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/session";
import { hasPermission } from "@/lib/permissions";
import { getLoyaltyConfig } from "@/lib/loyalty";
import { upgradeMessage } from "@/lib/plan-gating";

const text = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) || null : null);

// Edit a customer's details, or deactivate / reactivate them. Customers are
// never deleted, so their past sales and prescriptions stay intact.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasPermission(session.tenantId, session.role, "customers"))) {
    return NextResponse.json({ error: "You don't have access to Customers." }, { status: 403 });
  }
  if (!(await getLoyaltyConfig(session.tenantId)).planHasIt) {
    return NextResponse.json({ error: upgradeMessage("loyalty") }, { status: 403 });
  }

  const { id } = await params;
  const existing = await prisma.customer.findFirst({ where: { id, tenantId: session.tenantId }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: "Customer not found." }, { status: 404 });

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const data: Record<string, unknown> = {};
  if ("firstName" in body || "lastName" in body) {
    const firstName = text(body.firstName, 100);
    const lastName = text(body.lastName, 100);
    if (!firstName || !lastName) return NextResponse.json({ error: "First and last name are required." }, { status: 400 });
    data.firstName = firstName;
    data.lastName = lastName;
  }
  if ("phone" in body) data.phone = text(body.phone, 40);
  if ("email" in body) {
    const email = text(body.email, 200);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    data.email = email;
  }
  if ("address" in body) data.address = text(body.address, 300);
  if ("city" in body) data.city = text(body.city, 100);
  if ("dateOfBirth" in body) {
    const raw = text(body.dateOfBirth, 10);
    if (raw && !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return NextResponse.json({ error: "Enter a valid birthday." }, { status: 400 });
    data.dateOfBirth = raw ? new Date(`${raw}T00:00:00+08:00`) : null;
  }
  if ("isActive" in body) {
    if (typeof body.isActive !== "boolean") return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    data.isActive = body.isActive;
  }

  const updated = await prisma.customer.update({ where: { id }, data });
  return NextResponse.json(updated);
}
