import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/session";
import { getRolePermissions } from "@/lib/permissions";
import { parseSupplierBody } from "@/lib/supplier-input";
import { supplierBalances } from "@/lib/payables";

// Active suppliers for pickers (receiving, product form). With ?details=1 —
// the Suppliers page — every supplier with contact details, terms, and (for
// those who handle payments) what's owed.
export async function GET(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const p = await getRolePermissions(session.tenantId, session.role);
  if (!p.inventory && !p.products && !p.suppliers) {
    return NextResponse.json({ error: "You don't have access to suppliers." }, { status: 403 });
  }

  if (new URL(request.url).searchParams.get("details") !== "1") {
    const suppliers = await prisma.supplier.findMany({
      where: { tenantId: session.tenantId, isActive: true },
      select: { id: true, name: true, phone: true, paymentTermsDays: true },
      orderBy: { name: "asc" },
    });
    return NextResponse.json(suppliers);
  }

  if (!p.suppliers) return NextResponse.json({ error: "You don't have access to Suppliers." }, { status: 403 });
  const suppliers = await prisma.supplier.findMany({
    where: { tenantId: session.tenantId },
    select: { id: true, name: true, contactPerson: true, phone: true, email: true, paymentTermsDays: true, isActive: true },
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
  });
  const balances = await supplierBalances(session.tenantId);
  const lastDeliveries = p.suppliers_pay
    ? null
    : await prisma.receiving.groupBy({ by: ["supplierId"], where: { tenantId: session.tenantId, supplierId: { not: null } }, _max: { receivedAt: true } });

  return NextResponse.json({
    canPay: p.suppliers_pay,
    suppliers: suppliers.map((s) => {
      const b = balances.get(s.id);
      return {
        ...s,
        lastDelivery: b?.lastDelivery ?? lastDeliveries?.find((l) => l.supplierId === s.id)?._max.receivedAt?.toISOString() ?? null,
        ...(p.suppliers_pay ? { balance: b ?? null } : {}),
      };
    }),
  });
}

// Adds a supplier — from the Suppliers page, or typed in while receiving or
// adding a product. Re-adding an existing name, in any letter case, returns
// (and reactivates) the existing supplier.
export async function POST(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const p = await getRolePermissions(session.tenantId, session.role);
  if (!p.inventory_adjust && !p.products_edit && !p.suppliers) {
    return NextResponse.json({ error: "You don't have permission to add suppliers." }, { status: 403 });
  }

  const parsed = parseSupplierBody({ ...(await request.json()) });
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  if (!parsed.data.name) return NextResponse.json({ error: "Supplier name is required." }, { status: 400 });
  const { name, ...rest } = parsed.data;

  const existing = await prisma.supplier.findFirst({
    where: { tenantId: session.tenantId, name: { equals: name, mode: "insensitive" } },
    select: { id: true, name: true, phone: true, isActive: true },
  });
  if (existing) {
    if (!existing.isActive) await prisma.supplier.update({ where: { id: existing.id }, data: { isActive: true } });
    return NextResponse.json({ id: existing.id, name: existing.name, phone: existing.phone });
  }

  const supplier = await prisma.supplier.create({
    data: { tenantId: session.tenantId, name, ...rest, isActive: true },
    select: { id: true, name: true, phone: true },
  });
  return NextResponse.json(supplier, { status: 201 });
}
