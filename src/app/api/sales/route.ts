import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/session";
import { calculateVatInclusiveTotals, type DiscountType } from "@/lib/vat-calculations";
import { getTenantPlanCode, hasFeature } from "@/lib/plan-gating";
import { runInBackground } from "@/lib/background";
import { notifySaleCreated, notifyStockThresholdReached } from "@/lib/notifications";
import { getReceiptSettings } from "@/lib/receipt-settings";

interface CheckoutItem {
  productId: string;
  quantity: number;
  price: number;
}

interface PrescriptionDraft {
  customerId?: string;
  newCustomer?: { firstName: string; lastName: string; phone?: string };
  doctorId?: string;
  newDoctor?: { firstName: string; lastName: string; licenseNumber?: string };
  writtenDate: string;
  instructions?: string;
  refillsAllowed?: number;
}

export async function GET(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sales = await prisma.sale.findMany({
    where: { tenantId: session.tenantId },
    include: {
      items: { include: { product: true } },
      customer: true,
      user: { select: { id: true, firstName: true, lastName: true, username: true, role: true } },
    },
    orderBy: { saleDate: "desc" },
    take: 100,
  });

  return NextResponse.json(sales);
}

export async function POST(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.storeId) return NextResponse.json({ error: "No branch assigned to this account." }, { status: 400 });

  const body = await request.json();
  const {
    items,
    paymentMethod,
    cashReceived,
    discountType,
    customerId,
    orderRemarks,
    prescriptionId,
    prescriptionDraft,
  }: {
    items: CheckoutItem[];
    paymentMethod: string;
    cashReceived?: number;
    discountType?: DiscountType;
    customerId?: string;
    orderRemarks?: string;
    prescriptionId?: string;
    prescriptionDraft?: PrescriptionDraft;
  } = body;

  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: "Cart is empty." }, { status: 400 });
  }
  if (!paymentMethod) {
    return NextResponse.json({ error: "paymentMethod is required." }, { status: 400 });
  }

  const productIds = items.map((item) => item.productId);
  const products = await prisma.product.findMany({
    where: { id: { in: productIds }, tenantId: session.tenantId },
    include: { stocks: { where: { storeId: session.storeId } } },
  });
  const productMap = new Map(products.map((p) => [p.id, p]));

  for (const item of items) {
    const product = productMap.get(item.productId);
    if (!product) {
      return NextResponse.json({ error: `Product ${item.productId} not found.` }, { status: 400 });
    }
    const available = product.stocks[0]?.currentStock ?? 0;
    if (item.quantity <= 0) {
      return NextResponse.json({ error: `Invalid quantity for ${product.name}.` }, { status: 400 });
    }
    if (item.quantity > available) {
      return NextResponse.json(
        { error: `Not enough stock for ${product.name}. Available: ${available}.` },
        { status: 409 }
      );
    }
  }

  const requiresPrescription = items.some((item) => productMap.get(item.productId)?.requiresPrescription);
  const prescriptionsGated = requiresPrescription && (await hasFeature(await getTenantPlanCode(session.tenantId), "prescriptions"));
  if (prescriptionsGated) {
    if (prescriptionId) {
      const prescription = await prisma.prescription.findFirst({ where: { id: prescriptionId, tenantId: session.tenantId } });
      if (!prescription) {
        return NextResponse.json({ error: "Prescription not found." }, { status: 400 });
      }
      if (prescription.status !== "PENDING" && prescription.status !== "PARTIAL") {
        return NextResponse.json({ error: `Prescription is ${prescription.status.toLowerCase()} and cannot be filled.` }, { status: 400 });
      }
    } else if (prescriptionDraft) {
      if (!prescriptionDraft.customerId && !prescriptionDraft.newCustomer) {
        return NextResponse.json({ error: "A customer is required for the prescription." }, { status: 400 });
      }
      if (!prescriptionDraft.doctorId && !prescriptionDraft.newDoctor) {
        return NextResponse.json({ error: "A prescribing doctor is required for the prescription." }, { status: 400 });
      }
      if (!prescriptionDraft.writtenDate) {
        return NextResponse.json({ error: "The prescription date is required." }, { status: 400 });
      }
    }
  }

  let vatableSubtotal = 0;
  let nonVatableSubtotal = 0;
  for (const item of items) {
    const product = productMap.get(item.productId)!;
    const lineTotal = item.price * item.quantity;
    if (product.isVatable) vatableSubtotal += lineTotal;
    else nonVatableSubtotal += lineTotal;
  }

  const normalizedDiscountType: DiscountType = ["SENIOR", "PWD", "STUDENT", "EMPLOYEE"].includes(
    discountType ?? ""
  )
    ? (discountType as DiscountType)
    : "NONE";
  const discountPercent =
    normalizedDiscountType === "SENIOR" || normalizedDiscountType === "PWD"
      ? 20
      : normalizedDiscountType === "STUDENT"
      ? 10
      : normalizedDiscountType === "EMPLOYEE"
      ? 15
      : 0;

  const vatTotals = calculateVatInclusiveTotals({
    vatableTotal: vatableSubtotal,
    nonVatableTotal: nonVatableSubtotal,
    discountType: normalizedDiscountType,
    discountPercent,
  });

  const totalAmount = vatTotals.finalTotal;
  const changeGiven =
    paymentMethod === "CASH" && cashReceived ? Number((cashReceived - totalAmount).toFixed(2)) : null;

  if (paymentMethod === "CASH" && cashReceived != null && cashReceived < totalAmount) {
    return NextResponse.json({ error: "Cash received is less than the total amount." }, { status: 400 });
  }

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayCount = await prisma.sale.count({
    where: { tenantId: session.tenantId, saleDate: { gte: todayStart } },
  });
  const dateKey = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(
    now.getDate()
  ).padStart(2, "0")}`;
  const saleNumber = `OR-${dateKey}-${String(todayCount + 1).padStart(4, "0")}`;

  const openShift = await prisma.shift.findFirst({
    where: { tenantId: session.tenantId, storeId: session.storeId, userId: session.userId, closedAt: null },
    select: { id: true },
  });

  const sale = await prisma.$transaction(async (tx) => {
    let resolvedPrescriptionId: string | null = null;
    let resolvedCustomerId = customerId || null;

    if (prescriptionsGated && prescriptionId) {
      resolvedPrescriptionId = prescriptionId;
      await tx.prescription.update({ where: { id: prescriptionId }, data: { status: "FILLED" } });
    } else if (prescriptionsGated && prescriptionDraft) {
      const draftCustomerId = prescriptionDraft.customerId
        ?? (
          await tx.customer.create({
            data: {
              tenantId: session.tenantId,
              firstName: prescriptionDraft.newCustomer!.firstName,
              lastName: prescriptionDraft.newCustomer!.lastName,
              phone: prescriptionDraft.newCustomer!.phone || null,
            },
          })
        ).id;

      const draftDoctorId = prescriptionDraft.doctorId
        ?? (
          await tx.doctor.create({
            data: {
              tenantId: session.tenantId,
              firstName: prescriptionDraft.newDoctor!.firstName,
              lastName: prescriptionDraft.newDoctor!.lastName,
              licenseNumber: prescriptionDraft.newDoctor!.licenseNumber || null,
            },
          })
        ).id;

      const rxDateKey = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
      const rxTodayCount = await tx.prescription.count({
        where: { tenantId: session.tenantId, createdAt: { gte: todayStart } },
      });
      const prescriptionNumber = `RX-${rxDateKey}-${String(rxTodayCount + 1).padStart(4, "0")}`;

      const rxItems = items.filter((item) => productMap.get(item.productId)?.requiresPrescription);

      const createdPrescription = await tx.prescription.create({
        data: {
          tenantId: session.tenantId,
          prescriptionNumber,
          customerId: draftCustomerId,
          doctorId: draftDoctorId,
          originalDate: new Date(prescriptionDraft.writtenDate),
          writtenDate: new Date(prescriptionDraft.writtenDate),
          instructions: prescriptionDraft.instructions || null,
          refillsAllowed: prescriptionDraft.refillsAllowed ?? 0,
          status: "FILLED",
          items: {
            create: rxItems.map((item) => ({ productId: item.productId, quantity: item.quantity })),
          },
        },
      });

      resolvedPrescriptionId = createdPrescription.id;
      resolvedCustomerId = resolvedCustomerId ?? draftCustomerId;
    }

    const created = await tx.sale.create({
      data: {
        tenantId: session.tenantId,
        storeId: session.storeId!,
        saleNumber,
        subtotal: vatTotals.subtotal,
        vatableSales: vatTotals.vatableSales,
        nonVatableSales: vatTotals.nonVatableSales,
        taxAmount: vatTotals.vatAmount,
        discountType: normalizedDiscountType,
        discountAmount: vatTotals.discountAmount,
        totalAmount,
        paymentMethod: paymentMethod as never,
        cashReceived: cashReceived ?? null,
        changeGiven,
        orderRemarks: orderRemarks || null,
        customerId: resolvedCustomerId,
        userId: session.userId,
        prescriptionId: resolvedPrescriptionId,
        shiftId: openShift?.id ?? null,
      },
    });

    await tx.saleItem.createMany({
      data: items.map((item) => ({
        saleId: created.id,
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: item.price,
        totalPrice: item.price * item.quantity,
      })),
    });

    for (const item of items) {
      await tx.productStock.update({
        where: { productId_storeId: { productId: item.productId, storeId: session.storeId! } },
        data: { currentStock: { decrement: item.quantity } },
      });

      // FEFO consumption: draw down whichever batches exist for this product,
      // soonest-to-expire first, so older stock doesn't sit unsold until it expires.
      // Products with no tracked batches (most of the catalog, unless stock was
      // received via "Receive batch") are unaffected — only the aggregate above applies.
      let remaining = item.quantity;
      const batches = await tx.productBatch.findMany({
        where: { productId: item.productId, quantity: { gt: 0 } },
        orderBy: [{ expirationDate: "asc" }, { receivedDate: "asc" }],
      });
      for (const batch of batches) {
        if (remaining <= 0) break;
        const consume = Math.min(batch.quantity, remaining);
        await tx.productBatch.update({ where: { id: batch.id }, data: { quantity: { decrement: consume } } });
        remaining -= consume;
      }
    }

    await tx.stockMovement.createMany({
      data: items.map((item) => ({
        tenantId: session.tenantId,
        storeId: session.storeId!,
        type: "SALE" as const,
        quantity: -item.quantity,
        reason: `Sale ${saleNumber}`,
        reference: saleNumber,
        productId: item.productId,
        userId: session.userId,
      })),
    });

    return created;
  });

  const completeSale = await prisma.sale.findUnique({
    where: { id: sale.id },
    include: {
      items: { include: { product: true } },
      customer: true,
      user: { select: { id: true, firstName: true, lastName: true, username: true, role: true } },
    },
  });

  if (completeSale) {
    runInBackground("sale notification", async () => {
      const store = await getReceiptSettings(session.tenantId);
      let vatExemptSales: number | undefined;
      if (completeSale.discountType === "SENIOR" || completeSale.discountType === "PWD") {
        const vatableTotal = Number(completeSale.vatableSales) + Number(completeSale.discountAmount);
        vatExemptSales = Number((vatableTotal / 1.12).toFixed(2));
      }

      await notifySaleCreated({
        tenantId: session.tenantId,
        saleNumber: completeSale.saleNumber,
        saleDate: completeSale.saleDate,
        items: completeSale.items.map((item) => ({
          name: item.product.name,
          quantity: item.quantity,
          unitPrice: Number(item.unitPrice),
          totalPrice: Number(item.totalPrice),
        })),
        subtotal: Number(completeSale.subtotal),
        discountType: completeSale.discountType ?? "NONE",
        discountAmount: Number(completeSale.discountAmount),
        taxAmount: Number(completeSale.taxAmount),
        vatableSales: Number(completeSale.vatableSales),
        nonVatableSales: Number(completeSale.nonVatableSales),
        zeroRatedSales: 0,
        vatExemptSales,
        totalAmount: Number(completeSale.totalAmount),
        paymentMethod: completeSale.paymentMethod,
        cashReceived: completeSale.cashReceived != null ? Number(completeSale.cashReceived) : undefined,
        changeGiven: completeSale.changeGiven != null ? Number(completeSale.changeGiven) : undefined,
        customer: completeSale.customer ?? undefined,
        cashier: { firstName: completeSale.user.firstName, lastName: completeSale.user.lastName },
        orderRemarks: completeSale.orderRemarks,
        createdBy: `${completeSale.user.firstName} ${completeSale.user.lastName}`.trim(),
        store,
      });
    });

    for (const item of items) {
      const product = productMap.get(item.productId)!;
      const previousStock = product.stocks[0]?.currentStock ?? 0;
      runInBackground(`stock notification for ${product.name}`, () =>
        notifyStockThresholdReached({
          tenantId: session.tenantId,
          productName: product.name,
          categoryName: undefined,
          previousStock,
          currentStock: previousStock - item.quantity,
          minimumStock: product.minimumStock,
          reason: `Sale ${saleNumber}`,
        })
      );
    }
  }

  return NextResponse.json(completeSale, { status: 201 });
}
