import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/session";
import { hasPermission } from "@/lib/permissions";
import { canManageAllBranches } from "@/lib/branch-scope";
import { startOfDatePH, endOfDatePH } from "@/lib/timezone";
import { invalidateCached } from "@/lib/route-cache";
import { runInBackground } from "@/lib/background";
import { notifyStockThresholdReached } from "@/lib/notifications";
import { ReceivingError, receiveDelivery, validateReceiving, type ReceivingInput } from "@/lib/receiving";

// Deliveries received at this branch (or every branch for owners/admins with
// ?branch=all), newest first, with their lines.
export async function GET(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasPermission(session.tenantId, session.role, "inventory"))) {
    return NextResponse.json({ error: "You don't have access to Inventory." }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const allBranches = searchParams.get("branch") === "all" && canManageAllBranches(session.role);
  const supplierId = searchParams.get("supplierId");
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const q = searchParams.get("q")?.trim();

  const where: Prisma.ReceivingWhereInput = { tenantId: session.tenantId };
  if (!allBranches) where.storeId = session.storeId ?? "__none";
  if (supplierId) where.supplierId = supplierId;
  if (from || to) where.receivedAt = { ...(from ? { gte: startOfDatePH(from) } : {}), ...(to ? { lt: endOfDatePH(to) } : {}) };
  if (q) {
    where.OR = [
      { receivingNumber: { contains: q, mode: "insensitive" } },
      { referenceNumber: { contains: q, mode: "insensitive" } },
      { supplier: { name: { contains: q, mode: "insensitive" } } },
      { items: { some: { OR: [{ batchNumber: { contains: q, mode: "insensitive" } }, { product: { name: { contains: q, mode: "insensitive" } } }] } } },
    ];
  }

  const receivings = await prisma.receiving.findMany({
    where,
    orderBy: { receivedAt: "desc" },
    take: 100,
    include: {
      supplier: { select: { id: true, name: true } },
      store: { select: { name: true } },
      receivedBy: { select: { firstName: true, lastName: true } },
      items: {
        orderBy: { id: "asc" },
        select: {
          id: true,
          batchNumber: true,
          expirationDate: true,
          quantity: true,
          unitCost: true,
          product: { select: { id: true, name: true, strength: true, dosageForm: true } },
        },
      },
    },
  });

  return NextResponse.json(
    receivings.map((r) => ({
      id: r.id,
      receivingNumber: r.receivingNumber,
      referenceNumber: r.referenceNumber,
      receivedAt: r.receivedAt.toISOString(),
      notes: r.notes,
      totalCost: Number(r.totalCost),
      supplier: r.supplier,
      branchName: r.store.name,
      receivedBy: `${r.receivedBy.firstName} ${r.receivedBy.lastName}`.trim(),
      items: r.items.map((i) => ({
        id: i.id,
        productId: i.product.id,
        name: i.product.name,
        detail: [i.product.strength, i.product.dosageForm].filter(Boolean).join(" · "),
        batchNumber: i.batchNumber,
        expirationDate: i.expirationDate.toISOString(),
        quantity: i.quantity,
        unitCost: Number(i.unitCost),
      })),
    }))
  );
}

// Receives a delivery: { supplierId?, referenceNumber?, receivedDate?, notes?, items: [...] }.
export async function POST(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasPermission(session.tenantId, session.role, "inventory_adjust"))) {
    return NextResponse.json({ error: "You don't have permission to change stock." }, { status: 403 });
  }
  if (!session.storeId) return NextResponse.json({ error: "No branch assigned to this account." }, { status: 400 });

  const input = (await request.json()) as ReceivingInput;
  try {
    const lines = await validateReceiving(session.tenantId, input);
    const supplier = input.supplierId
      ? await prisma.supplier.findFirst({ where: { id: input.supplierId, tenantId: session.tenantId }, select: { id: true, name: true } })
      : null;
    if (input.supplierId && !supplier) throw new ReceivingError("Supplier not found.");

    const { receiving, stockChanges } = await receiveDelivery({
      tenantId: session.tenantId,
      storeId: session.storeId,
      userId: session.userId,
      input,
      lines,
      supplier,
    });

    const products = await prisma.product.findMany({
      where: { id: { in: stockChanges.map((c) => c.productId) } },
      select: { id: true, minimumStock: true, category: { select: { name: true } } },
    });
    const productOf = new Map(products.map((p) => [p.id, p]));
    for (const c of stockChanges) {
      runInBackground(`stock notification for ${c.name}`, () =>
        notifyStockThresholdReached({
          tenantId: session.tenantId,
          storeId: session.storeId,
          productName: c.name,
          categoryName: productOf.get(c.productId)?.category?.name,
          previousStock: c.previousStock,
          currentStock: c.currentStock,
          minimumStock: productOf.get(c.productId)?.minimumStock ?? 0,
          reason: `Received ${receiving.receivingNumber}`,
        })
      );
    }

    invalidateCached(`products:${session.tenantId}`);
    return NextResponse.json({ id: receiving.id, receivingNumber: receiving.receivingNumber, totalCost: Number(receiving.totalCost) }, { status: 201 });
  } catch (error) {
    if (error instanceof ReceivingError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("Error receiving delivery", error);
    return NextResponse.json({ error: "Failed to receive the delivery." }, { status: 500 });
  }
}
