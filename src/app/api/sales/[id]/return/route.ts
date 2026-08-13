import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/session";
import { invalidateCached } from "@/lib/route-cache";

const CAN_RETURN_ROLES = ["OWNER", "ADMIN", "MANAGER"];

interface ReturnItemInput {
  saleItemId: string;
  quantity: number;
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!CAN_RETURN_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "You don't have permission to process returns." }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json();
  const { items, reason }: { items: ReturnItemInput[]; reason?: string } = body;

  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: "Select at least one item to return." }, { status: 400 });
  }

  const sale = await prisma.sale.findFirst({
    where: { id, tenantId: session.tenantId },
    include: { items: { include: { product: true } } },
  });
  if (!sale) return NextResponse.json({ error: "Sale not found." }, { status: 404 });
  if (sale.status === "CANCELLED") {
    return NextResponse.json({ error: "Cannot return items on a voided sale." }, { status: 400 });
  }

  const saleItemMap = new Map(sale.items.map((i) => [i.id, i]));
  const originalSubtotal = Number(sale.subtotal);
  const originalTax = Number(sale.taxAmount);
  const originalDiscount = Number(sale.discountAmount);
  const originalTotal = Number(sale.totalAmount);

  let returnSubtotal = 0;
  const lines: Array<{ saleItemId: string; productId: string; unitPrice: number; quantity: number; lineTotal: number }> = [];

  for (const req of items) {
    const saleItem = saleItemMap.get(req.saleItemId);
    if (!saleItem) return NextResponse.json({ error: "One of the selected items doesn't belong to this sale." }, { status: 400 });
    const remaining = saleItem.quantity - saleItem.returnedQuantity;
    if (!req.quantity || req.quantity <= 0 || req.quantity > remaining) {
      return NextResponse.json(
        { error: `Invalid return quantity for ${saleItem.product.name}. Available to return: ${remaining}.` },
        { status: 400 }
      );
    }
    const unitPrice = Number(saleItem.unitPrice);
    const lineTotal = unitPrice * req.quantity;
    returnSubtotal += lineTotal;
    lines.push({ saleItemId: saleItem.id, productId: saleItem.productId, unitPrice, quantity: req.quantity, lineTotal });
  }

  const ratio = originalSubtotal > 0 ? returnSubtotal / originalSubtotal : 0;
  const returnTax = Number((originalTax * ratio).toFixed(2));
  const returnDiscount = Number((originalDiscount * ratio).toFixed(2));
  const returnTotal = Number((originalTotal * ratio).toFixed(2));

  const now = new Date();
  const dateKey = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  const todayReturnCount = await prisma.sale.count({
    where: { tenantId: session.tenantId, saleNumber: { startsWith: `RET-${dateKey}` } },
  });
  const returnSaleNumber = `RET-${dateKey}-${String(todayReturnCount + 1).padStart(4, "0")}`;

  const openShift = await prisma.shift.findFirst({
    where: { tenantId: session.tenantId, storeId: sale.storeId, userId: session.userId, closedAt: null },
    select: { id: true },
  });

  try {
    const returnSale = await prisma.$transaction(async (tx) => {
      const created = await tx.sale.create({
        data: {
          tenantId: session.tenantId,
          storeId: sale.storeId,
          saleNumber: returnSaleNumber,
          subtotal: -returnSubtotal,
          taxAmount: -returnTax,
          discountAmount: -returnDiscount,
          totalAmount: -returnTotal,
          paymentMethod: sale.paymentMethod,
          orderRemarks: reason ? `Return for ${sale.saleNumber}: ${reason}` : `Return for ${sale.saleNumber}`,
          customerId: sale.customerId,
          userId: session.userId,
          status: "RETURNED",
          originalSaleId: sale.id,
          shiftId: openShift?.id ?? null,
        },
      });

      await tx.saleItem.createMany({
        data: lines.map((l) => ({
          saleId: created.id,
          productId: l.productId,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          totalPrice: -l.lineTotal,
        })),
      });

      for (const l of lines) {
        await tx.saleItem.update({
          where: { id: l.saleItemId },
          data: { returnedQuantity: { increment: l.quantity } },
        });

        await tx.productStock.upsert({
          where: { productId_storeId: { productId: l.productId, storeId: sale.storeId } },
          update: { currentStock: { increment: l.quantity } },
          create: { productId: l.productId, storeId: sale.storeId, currentStock: l.quantity },
        });
      }

      await tx.stockMovement.createMany({
        data: lines.map((l) => ({
          tenantId: session.tenantId,
          storeId: sale.storeId,
          type: "RETURN" as const,
          quantity: l.quantity,
          reason: reason ? `Return for ${sale.saleNumber}: ${reason}` : `Return for ${sale.saleNumber}`,
          reference: returnSaleNumber,
          productId: l.productId,
          userId: session.userId,
        })),
      });

      const updatedItems = await tx.saleItem.findMany({ where: { saleId: sale.id } });
      const fullyReturned = updatedItems.every((i) => i.returnedQuantity >= i.quantity);
      if (fullyReturned) {
        await tx.sale.update({ where: { id: sale.id }, data: { status: "RETURNED" } });
      }

      return created;
    });

    invalidateCached(`products:${session.tenantId}`);
    return NextResponse.json(returnSale, { status: 201 });
  } catch (error) {
    console.error("Error processing return", error);
    return NextResponse.json({ error: "Failed to process return." }, { status: 500 });
  }
}
