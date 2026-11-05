import { NextRequest, NextResponse } from "next/server";
import { E_WALLET_PROVIDERS, normalizeReference } from "@/lib/payment-methods";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/session";
import { calculateVatInclusiveTotals, type DiscountType } from "@/lib/vat-calculations";
import { discountCalcInput, discountRateText, ensureDefaultDiscounts, isDiscountAvailable } from "@/lib/discounts";
import { getTenantPlanCode, hasFeature } from "@/lib/plan-gating";
import { runInBackground } from "@/lib/background";
import { notifySaleCreated, notifyStockThresholdReached } from "@/lib/notifications";
import { getReceiptSettings } from "@/lib/receipt-settings";
import { invalidateCached } from "@/lib/route-cache";
import { canCollectPayment, isShiftRequired, phDayOf } from "@/lib/permissions-shared";
import { batchesAtStore } from "@/lib/branch-scope";
import { getRolePermissions, hasPermission, saleVisibilityWhere } from "@/lib/permissions";
import { readOrderPrescription } from "@/lib/order-prescription";
import { identifyStaff, staffCodeRequired } from "@/lib/staff-code";

class PendingOrderTakenError extends Error {}
class StockRanOutError extends Error {
  constructor(readonly productId: string) {
    super("Stock ran out during the sale.");
  }
}

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
  // Prescribed quantity per product when more was prescribed than is bought now.
  prescribedQuantities?: Record<string, number>;
}

export async function GET(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!(await hasPermission(session.tenantId, session.role, "sales"))) {
    return NextResponse.json({ error: "You don't have access to Sales." }, { status: 403 });
  }

  const sales = await prisma.sale.findMany({
    where: { tenantId: session.tenantId, ...(await saleVisibilityWhere(session)) },
    select: {
      id: true,
      saleNumber: true,
      saleDate: true,
      subtotal: true,
      discountType: true,
      discountAmount: true,
      taxAmount: true,
      totalAmount: true,
      paymentMethod: true,
      status: true,
      items: {
        select: {
          quantity: true,
          unitPrice: true,
          totalPrice: true,
          product: { select: { id: true, name: true } },
        },
      },
      customer: { select: { id: true, firstName: true, lastName: true } },
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
  if (!(await hasPermission(session.tenantId, session.role, "pos"))) {
    return NextResponse.json({ error: "You don't have access to the POS." }, { status: 403 });
  }
  if (!session.storeId) return NextResponse.json({ error: "No branch assigned to this account." }, { status: 400 });
  if (!canCollectPayment(session.role, await getRolePermissions(session.tenantId, session.role))) {
    return NextResponse.json({ error: "Your role can't collect payment. Send the order to a cashier instead." }, { status: 403 });
  }

  const body = await request.json();
  const {
    pendingOrderId,
    items,
    paymentMethod,
    cashReceived,
    paymentProvider,
    paymentReference,
    discountId,
    discountType,
    discountIdNumber,
    discountHolderName,
    customerId,
    orderRemarks,
    prescriptionId: requestedPrescriptionId,
    prescriptionDraft: requestedPrescriptionDraft,
  }: {
    pendingOrderId?: string;
    items: CheckoutItem[];
    paymentMethod: string;
    cashReceived?: number;
    paymentProvider?: string;
    paymentReference?: string;
    discountId?: string;
    discountType?: DiscountType;
    discountIdNumber?: string;
    discountHolderName?: string;
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
  if (!["CASH", "E_WALLET"].includes(paymentMethod)) {
    return NextResponse.json({ error: "Payment must be cash or e-wallet." }, { status: 400 });
  }
  const isEWallet = paymentMethod === "E_WALLET";
  const walletProvider = isEWallet && E_WALLET_PROVIDERS.includes(paymentProvider as never) ? paymentProvider! : null;
  const walletReference = isEWallet ? normalizeReference(paymentReference) : "";
  if (isEWallet && !walletProvider) {
    return NextResponse.json({ error: "Choose which e-wallet the customer paid with." }, { status: 400 });
  }
  if (isEWallet && walletReference.length < 4) {
    return NextResponse.json({ error: "Enter the e-wallet reference number from the customer's receipt." }, { status: 400 });
  }
  // The same transfer can't pay for two sales — catches a double-tapped
  // checkout or a customer showing an old payment screenshot.
  if (isEWallet) {
    const used = await prisma.sale.findFirst({
      where: { tenantId: session.tenantId, paymentMethod: "E_WALLET", paymentProvider: walletProvider, paymentReference: walletReference },
      select: { saleNumber: true },
    });
    if (used) {
      return NextResponse.json({ error: `Reference ${walletReference} was already used for sale ${used.saleNumber}.` }, { status: 409 });
    }
  }

  const pendingOrder = pendingOrderId
    ? await prisma.pendingOrder.findFirst({
        where: { id: pendingOrderId, tenantId: session.tenantId, storeId: session.storeId },
        select: { id: true, status: true, createdById: true, takenById: true, orderRemarks: true, prescription: true },
      })
    : null;
  if (pendingOrderId && !pendingOrder) {
    return NextResponse.json({ error: "Order not found for this branch." }, { status: 400 });
  }
  if (pendingOrder && pendingOrder.status !== "OPEN") {
    return NextResponse.json({ error: `This order was already ${pendingOrder.status.toLowerCase()}.` }, { status: 409 });
  }

  // With security codes on, the sale is on record as whoever entered theirs.
  let servedById: string | null = null;
  if (await staffCodeRequired(session.tenantId)) {
    const who = await identifyStaff(session.tenantId, session.userId, body.staffCode, "checkout");
    if ("error" in who) return NextResponse.json({ error: who.error, code: "STAFF_CODE" }, { status: who.status });
    servedById = who.user.id;
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
    if (product.stocks[0]?.isHidden) {
      return NextResponse.json({ error: `${product.name} isn't sold at this branch.` }, { status: 400 });
    }
    const available = product.stocks[0]?.currentStock ?? 0;
    if (item.quantity <= 0) {
      return NextResponse.json({ error: `Invalid quantity for ${product.name}.` }, { status: 400 });
    }
    if (item.quantity > available) {
      return NextResponse.json(
        { error: `Not enough stock for ${product.name}. Available: ${available}.`, code: "STOCK" },
        { status: 409 }
      );
    }
    // The price always comes from the database (this branch's own price, else
    // the product's) — never trusted from the client. A mismatch means the cart
    // is stale or was tampered with, so refuse rather than charge a different
    // amount than the cashier showed the customer.
    const unitPrice = Number(product.stocks[0]?.sellingPrice ?? product.sellingPrice);
    if (!Number.isFinite(Number(item.price)) || Math.abs(Number(item.price) - unitPrice) > 0.005) {
      return NextResponse.json(
        { error: `The price of ${product.name} is now ₱${unitPrice.toFixed(2)}. Remove it from the cart and add it again.` },
        { status: 409 }
      );
    }
    item.price = unitPrice;
  }

  // A prescription entered at checkout is recorded whenever the plan includes
  // prescriptions — not only when a cart item is flagged Rx. Pharmacists often
  // log prescriptions for items that aren't flagged, and dropping them silently
  // left them missing from the Prescriptions page.
  // An order sent with a prescription uses that one: whoever took the order
  // entered it, and the cashier only takes payment.
  const orderRx = readOrderPrescription(pendingOrder?.prescription);
  const prescriptionId = orderRx ? orderRx.prescriptionId : requestedPrescriptionId;
  const prescriptionDraft: PrescriptionDraft | undefined = orderRx ? orderRx.prescriptionDraft : requestedPrescriptionDraft;
  const hasPrescriptionInput = Boolean(prescriptionId || prescriptionDraft);
  const prescriptionsGated = hasPrescriptionInput && (await hasFeature(await getTenantPlanCode(session.tenantId), "prescriptions"));
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

  // The discount comes from the workspace's own list (Settings › Discounts).
  // Older checkouts send only the code (SENIOR, PWD, ...), which maps to the
  // same entry, so a sale rung up mid-deploy still gets the right discount.
  let discount = null as Awaited<ReturnType<typeof prisma.discount.findFirst>>;
  if (discountId || (discountType && discountType !== "NONE")) {
    await ensureDefaultDiscounts(session.tenantId);
    discount = await prisma.discount.findFirst({
      where: { tenantId: session.tenantId, ...(discountId ? { id: discountId } : { code: discountType }) },
    });
    if (!discount || !isDiscountAvailable(discount, session.storeId)) {
      return NextResponse.json({ error: "That discount isn't available right now. Choose another one." }, { status: 400 });
    }
  }
  const appliedDiscount = discount
    ? { code: discount.code, name: discount.name, kind: discount.kind, value: Number(discount.value), maxAmount: discount.maxAmount != null ? Number(discount.maxAmount) : null, vatExempt: discount.vatExempt }
    : null;
  const normalizedDiscountType: DiscountType = appliedDiscount?.code ?? "NONE";

  const vatTotals = calculateVatInclusiveTotals({
    vatableTotal: vatableSubtotal,
    nonVatableTotal: nonVatableSubtotal,
    ...(appliedDiscount ? discountCalcInput(appliedDiscount) : { discountType: "NONE", discountPercent: 0 }),
  });

  const totalAmount = vatTotals.finalTotal;
  const changeGiven =
    paymentMethod === "CASH" && cashReceived ? Number((cashReceived - totalAmount).toFixed(2)) : null;

  if (paymentMethod === "CASH" && cashReceived != null && cashReceived < totalAmount) {
    return NextResponse.json({ error: "Cash received is less than the total amount." }, { status: 400 });
  }

  const now = new Date();
  const dateKey = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(
    now.getDate()
  ).padStart(2, "0")}`;
  // "AR" (Acknowledgment Receipt), not "OR" (Official Receipt) — Nookly isn't
  // BIR-accredited, so the receipt can't claim to be an official tax document.
  const saleNumberPrefix = `AR-${dateKey}-`;
  // Assigned inside the transaction (last number today + 1); see the retry below.
  let saleNumber = "";

  const openShift = await prisma.shift.findFirst({
    where: { tenantId: session.tenantId, storeId: session.storeId, userId: session.userId, closedAt: null },
    select: { id: true, openedAt: true },
  });
  // Roles set to "Must start & end a shift" sell only from a shift opened today.
  if (isShiftRequired(session.role, await getRolePermissions(session.tenantId, session.role))) {
    if (!openShift) return NextResponse.json({ error: "Start your shift before ringing up sales.", code: "SHIFT_REQUIRED" }, { status: 400 });
    if (phDayOf(openShift.openedAt) !== phDayOf(new Date())) {
      return NextResponse.json({ error: "End the shift you started on an earlier day, then start today's.", code: "SHIFT_STALE" }, { status: 400 });
    }
  }

  const batchWhere = await batchesAtStore(session.tenantId, session.storeId);

  const placeSale = () => prisma.$transaction(async (tx) => {
    const lastToday = await tx.sale.findFirst({
      where: { tenantId: session.tenantId, saleNumber: { startsWith: saleNumberPrefix } },
      orderBy: { saleNumber: "desc" },
      select: { saleNumber: true },
    });
    const lastSeq = lastToday ? parseInt(lastToday.saleNumber.slice(saleNumberPrefix.length), 10) || 0 : 0;
    saleNumber = `${saleNumberPrefix}${String(lastSeq + 1).padStart(4, "0")}`;

    let resolvedPrescriptionId: string | null = null;
    let resolvedCustomerId = customerId || null;

    if (prescriptionsGated && prescriptionId) {
      // Continuing a prescription: what's bought now counts toward each prescribed item.
      resolvedPrescriptionId = prescriptionId;
      const rxItemsNow = await tx.prescriptionItem.findMany({ where: { prescriptionId } });
      for (const rxItem of rxItemsNow) {
        const bought = items.filter((i) => i.productId === rxItem.productId).reduce((sum, i) => sum + i.quantity, 0);
        if (bought > 0) {
          rxItem.servedQuantity += bought;
          await tx.prescriptionItem.update({ where: { id: rxItem.id }, data: { servedQuantity: rxItem.servedQuantity } });
        }
      }
      const fullyServed = rxItemsNow.every((i) => i.servedQuantity >= i.quantity);
      await tx.prescription.update({ where: { id: prescriptionId }, data: { status: fullyServed ? "FILLED" : "PARTIAL" } });
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
      // Continue from the day's last RX number (a count can repeat one after a delete).
      const lastRx = await tx.prescription.findFirst({
        where: { tenantId: session.tenantId, prescriptionNumber: { startsWith: `RX-${rxDateKey}-` } },
        orderBy: { prescriptionNumber: "desc" },
        select: { prescriptionNumber: true },
      });
      const lastRxSeq = lastRx ? parseInt(lastRx.prescriptionNumber.slice(`RX-${rxDateKey}-`.length), 10) || 0 : 0;
      const prescriptionNumber = `RX-${rxDateKey}-${String(lastRxSeq + 1).padStart(4, "0")}`;

      // The Rx-flagged items when there are any; otherwise everything prescribed in this sale.
      const flaggedItems = items.filter((item) => productMap.get(item.productId)?.requiresPrescription);
      const rxItems = flaggedItems.length > 0 ? flaggedItems : items;
      // Prescribed can be more than what's bought today (partially served), never less.
      const rxLines = rxItems.map((item) => {
        const prescribed = Math.trunc(Number(prescriptionDraft.prescribedQuantities?.[item.productId] ?? 0));
        return { productId: item.productId, quantity: Math.max(item.quantity, Number.isFinite(prescribed) ? prescribed : 0), servedQuantity: item.quantity };
      });

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
          storeId: session.storeId ?? null,
          status: rxLines.some((l) => l.servedQuantity < l.quantity) ? "PARTIAL" : "FILLED",
          items: { create: rxLines },
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
        discountIdNumber: discount ? discountIdNumber?.trim() || null : null,
        discountHolderName: discount ? discountHolderName?.trim() || null : null,
        discountId: discount?.id ?? null,
        discountName: appliedDiscount?.name ?? null,
        discountRate: appliedDiscount ? discountRateText(appliedDiscount) : null,
        discountVatExempt: appliedDiscount?.vatExempt ?? false,
        vatableGross: vatTotals.vatableGross,
        nonVatableGross: vatTotals.nonVatableGross,
        vatableDiscountAmount: vatTotals.vatableDiscountAmount,
        nonVatableDiscountAmount: vatTotals.nonVatableDiscountAmount,
        vatRemovedFromVatable: vatTotals.vatRemovedFromVatable,
        totalAmount,
        paymentMethod: paymentMethod as never,
        cashReceived: isEWallet ? null : cashReceived ?? null,
        paymentProvider: walletProvider,
        paymentReference: isEWallet ? walletReference : null,
        changeGiven,
        orderRemarks: orderRemarks || pendingOrder?.orderRemarks || null,
        customerId: resolvedCustomerId,
        userId: session.userId,
        orderTakerId: pendingOrder ? pendingOrder.takenById ?? pendingOrder.createdById : null,
        servedById,
        prescriptionId: resolvedPrescriptionId,
        shiftId: openShift?.id ?? null,
      },
    });

    if (pendingOrder) {
      // Conditional on OPEN so two cashiers can't both complete the same order.
      const claimed = await tx.pendingOrder.updateMany({
        where: { id: pendingOrder.id, status: "OPEN" },
        data: { status: "COMPLETED", saleId: created.id },
      });
      if (claimed.count !== 1) throw new PendingOrderTakenError();
    }

    await tx.saleItem.createMany({
      data: items.map((item) => ({
        saleId: created.id,
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: item.price,
        totalPrice: item.price * item.quantity,
        // The product's cost now (it follows the latest delivery), kept for profit reports.
        unitCost: productMap.get(item.productId)!.costPrice,
      })),
    });

    // The check above can pass for two cashiers selling the last piece at once,
    // so the stock only comes down if it's still there. If it isn't, the whole
    // sale rolls back. Going in one fixed order keeps two sales of the same
    // products from waiting on each other.
    for (const item of [...items].sort((a, b) => a.productId.localeCompare(b.productId))) {
      const taken = await tx.productStock.updateMany({
        where: { productId: item.productId, storeId: session.storeId!, currentStock: { gte: item.quantity } },
        data: { currentStock: { decrement: item.quantity } },
      });
      if (taken.count !== 1) throw new StockRanOutError(item.productId);
    }

    // Read now that this sale holds the stock rows, so a sale of the same product
    // has finished or is waiting, and both can't draw on the same batch quantity.
    const batchesByProduct = new Map<string, { id: string; quantity: number }[]>();
    for (const batch of await tx.productBatch.findMany({
      where: { productId: { in: productIds }, quantity: { gt: 0 }, ...batchWhere },
      orderBy: [{ expirationDate: "asc" }, { receivedDate: "asc" }],
      select: { id: true, productId: true, quantity: true },
    })) {
      const list = batchesByProduct.get(batch.productId) ?? [];
      list.push(batch);
      batchesByProduct.set(batch.productId, list);
    }

    for (const item of items) {
      // FEFO consumption: draw down whichever batches exist for this product,
      // soonest-to-expire first, so older stock doesn't sit unsold until it expires.
      // Products with no tracked batches (most of the catalog, unless stock was
      // received via "Receive batch") are unaffected — only the aggregate above applies.
      let remaining = item.quantity;
      const batches = batchesByProduct.get(item.productId) ?? [];
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
  }, { timeout: 30000, maxWait: 10000 }).catch((error) => {
    if (error instanceof PendingOrderTakenError) return null;
    throw error;
  });

  // Two cashiers (or two branches) checking out at the same moment can pick the
  // same next number; the unique index rejects the second one, so it simply
  // takes the following number instead of failing the sale.
  let sale: Awaited<ReturnType<typeof placeSale>> = null;
  for (let attempt = 1; ; attempt++) {
    try {
      sale = await placeSale();
      break;
    } catch (error) {
      if (error instanceof StockRanOutError) {
        const left = await prisma.productStock.findFirst({
          where: { productId: error.productId, storeId: session.storeId },
          select: { currentStock: true },
        });
        const name = productMap.get(error.productId)!.name;
        return NextResponse.json({ error: `Not enough stock for ${name}. Available: ${Math.max(0, left?.currentStock ?? 0)}.`, code: "STOCK" }, { status: 409 });
      }
      const target = (error as { code?: string; meta?: { target?: unknown } }).meta?.target;
      const isNumberClash = (error as { code?: string }).code === "P2002" && /saleNumber|prescriptionNumber/.test(String(target));
      if (isNumberClash && attempt < 5) continue;
      throw error;
    }
  }
  if (!sale) {
    return NextResponse.json({ error: "Another cashier already completed this order." }, { status: 409 });
  }

  invalidateCached(`products:${session.tenantId}`);

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
      if (completeSale.discountVatExempt) {
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
          storeId: session.storeId,
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
