import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/session";
import { getRolePermissions } from "@/lib/permissions";
import { parseSupplierBody } from "@/lib/supplier-input";
import { supplierBalances } from "@/lib/payables";

const name = (u: { firstName: string; lastName: string }) => `${u.firstName} ${u.lastName}`.trim();

// One supplier: details, deliveries, returns, and — for those who handle
// payments — the balance, payments, and what each delivery still owes.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const p = await getRolePermissions(session.tenantId, session.role);
  if (!p.suppliers) return NextResponse.json({ error: "You don't have access to Suppliers." }, { status: 403 });

  const { id } = await params;
  const supplier = await prisma.supplier.findFirst({ where: { id, tenantId: session.tenantId } });
  if (!supplier) return NextResponse.json({ error: "Supplier not found." }, { status: 404 });

  const [deliveries, returns, payments, balances] = await Promise.all([
    prisma.receiving.findMany({
      where: { tenantId: session.tenantId, supplierId: id },
      orderBy: { receivedAt: "desc" },
      take: 200,
      include: {
        store: { select: { name: true } },
        receivedBy: { select: { firstName: true, lastName: true } },
        _count: { select: { items: true } },
      },
    }),
    prisma.supplierReturn.findMany({
      where: { tenantId: session.tenantId, supplierId: id },
      orderBy: { returnedAt: "desc" },
      take: 100,
      include: {
        store: { select: { name: true } },
        createdBy: { select: { firstName: true, lastName: true } },
        items: { include: { product: { select: { name: true } } } },
      },
    }),
    p.suppliers_pay
      ? prisma.supplierPayment.findMany({
          where: { tenantId: session.tenantId, supplierId: id },
          orderBy: { paidAt: "desc" },
          take: 200,
          include: {
            recordedBy: { select: { firstName: true, lastName: true } },
            allocations: { include: { receiving: { select: { receivingNumber: true } } } },
          },
        })
      : [],
    p.suppliers_pay ? supplierBalances(session.tenantId, [id]) : null,
  ]);

  return NextResponse.json({
    canPay: p.suppliers_pay,
    canReturn: p.inventory_adjust,
    supplier: {
      id: supplier.id,
      name: supplier.name,
      contactPerson: supplier.contactPerson,
      phone: supplier.phone,
      email: supplier.email,
      address: supplier.address,
      tin: supplier.tin,
      paymentTermsDays: supplier.paymentTermsDays,
      notes: supplier.notes,
      isActive: supplier.isActive,
    },
    balance: balances?.get(id) ?? null,
    deliveries: deliveries.map((d) => ({
      id: d.id,
      receivingNumber: d.receivingNumber,
      referenceNumber: d.referenceNumber,
      receivedAt: d.receivedAt.toISOString(),
      branchName: d.store.name,
      receivedBy: name(d.receivedBy),
      itemCount: d._count.items,
      totalCost: Number(d.totalCost),
      ...(p.suppliers_pay ? { dueDate: d.dueDate?.toISOString() ?? null, amountPaid: Number(d.amountPaid) } : {}),
    })),
    returns: returns.map((r) => ({
      id: r.id,
      returnNumber: r.returnNumber,
      referenceNumber: r.referenceNumber,
      returnedAt: r.returnedAt.toISOString(),
      reason: r.reason,
      settlement: r.settlement,
      notes: r.notes,
      totalCost: Number(r.totalCost),
      branchName: r.store.name,
      createdBy: name(r.createdBy),
      items: r.items.map((i) => ({ id: i.id, name: i.product.name, batchNumber: i.batchNumber, quantity: i.quantity, unitCost: Number(i.unitCost) })),
    })),
    payments: payments.map((pm) => ({
      id: pm.id,
      amount: Number(pm.amount),
      paidAt: pm.paidAt.toISOString(),
      method: pm.method,
      referenceNumber: pm.referenceNumber,
      notes: pm.notes,
      voidedAt: pm.voidedAt?.toISOString() ?? null,
      recordedBy: name(pm.recordedBy),
      appliedTo: pm.allocations.map((a) => ({ receivingNumber: a.receiving.receivingNumber, amount: Number(a.amount) })),
    })),
  });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const p = await getRolePermissions(session.tenantId, session.role);
  if (!p.suppliers) return NextResponse.json({ error: "You don't have access to Suppliers." }, { status: 403 });

  const { id } = await params;
  const existing = await prisma.supplier.findFirst({ where: { id, tenantId: session.tenantId }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: "Supplier not found." }, { status: 404 });

  const parsed = parseSupplierBody(await request.json());
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  if (parsed.data.name) {
    const clash = await prisma.supplier.findFirst({
      where: { tenantId: session.tenantId, name: { equals: parsed.data.name, mode: "insensitive" }, NOT: { id } },
      select: { id: true },
    });
    if (clash) return NextResponse.json({ error: "Another supplier already has that name." }, { status: 409 });
  }
  const updated = await prisma.supplier.update({ where: { id }, data: parsed.data, select: { id: true, name: true } });
  return NextResponse.json(updated);
}
