import { prisma } from "@/lib/prisma";
import { getReceiptSettings } from "@/lib/receipt-settings";
import type { ReceiptBatch, ReceiptData } from "@/types/receipt";
import { returnParts } from "@/lib/return-parts";

const toNumber = (value: unknown) => Number(value ?? 0);
export const buildReceiptDataForSale = async (saleId: string, tenantId: string): Promise<ReceiptData | null> => {
  const sale = await prisma.sale.findFirst({
    where: { id: saleId, tenantId },
    select: {
      id: true,
      storeId: true,
      status: true,
      // A return's VAT split and discount come from its original sale (see returnParts).
      originalSale: {
        select: {
          saleNumber: true, subtotal: true, totalAmount: true, vatableSales: true, nonVatableSales: true, vatableGross: true, nonVatableGross: true,
          vatableDiscountAmount: true, nonVatableDiscountAmount: true, vatRemovedFromVatable: true,
          discountType: true, discountName: true, discountRate: true, discountVatExempt: true,
        },
      },
      prescription: {
        select: {
          prescriptionNumber: true,
          instructions: true,
          doctor: { select: { firstName: true, lastName: true, licenseNumber: true } },
          items: { select: { productId: true, instructions: true } },
        },
      },
      saleNumber: true,
      saleDate: true,
      subtotal: true,
      discountType: true,
      discountName: true,
      discountRate: true,
      discountVatExempt: true,
      discountAmount: true,
      discountIdNumber: true,
      discountHolderName: true,
      taxAmount: true,
      vatableSales: true,
      nonVatableSales: true,
      vatableGross: true,
      nonVatableGross: true,
      vatableDiscountAmount: true,
      nonVatableDiscountAmount: true,
      vatRemovedFromVatable: true,
      totalAmount: true,
      adjustmentAmount: true,
      adjustmentLabel: true,
      roundingAmount: true,
      computedParts: true,
      paymentMethod: true,
      paymentProvider: true,
      paymentReference: true,
      cashReceived: true,
      changeGiven: true,
      pointsRedeemed: true,
      pointsAmount: true,
      pointsEarned: true,
      // The sale's own points rows (not a later VOID), to show the balance right after it.
      loyaltyTransactions: { where: { type: { in: ["EARN", "REDEEM", "RETURN"] } }, select: { type: true, balanceAfter: true } },
      orderRemarks: true,
      customer: { select: { firstName: true, lastName: true } },
      user: { select: { firstName: true, lastName: true } },
      servedBy: { select: { firstName: true, lastName: true } },
      store: { select: { name: true, address: true, city: true, isMainBranch: true } },
      items: {
        select: {
          productId: true,
          batches: true,
          quantity: true,
          unitPrice: true,
          totalPrice: true,
          product: { select: { name: true, isVatable: true, genericName: true, barcode: true } },
        },
      },
    },
  });

  if (!sale) return null;

  const settings = await getReceiptSettings(tenantId);
  // Receipt settings are per workspace and describe the main branch. A sale at
  // any other branch prints that branch's own name and address instead.
  const branchAddress = [sale.store.address, sale.store.city].filter(Boolean).join(", ");
  const store = sale.store.isMainBranch
    ? settings
    : { ...settings, addressLine1: branchAddress || settings.addressLine1, addressLine2: sale.store.name };

  // VAT-exclusive base BEFORE discount, computed exactly from the persisted
  // breakdown rather than reverse-engineered from the post-discount figure.
  const vatExemptSales =
    sale.discountVatExempt || sale.discountType === "SENIOR" || sale.discountType === "PWD"
      ? Number((toNumber(sale.vatableGross) - toNumber(sale.vatRemovedFromVatable)).toFixed(2))
      : undefined;

  return {
    saleId: sale.id,
    saleNumber: sale.saleNumber,
    date: sale.saleDate,
    items: sale.items.map((item) => ({
      name: item.product.name,
      quantity: item.quantity,
      unitPrice: toNumber(item.unitPrice),
      totalPrice: toNumber(item.totalPrice),
      isVatable: item.product.isVatable ?? true,
      genericName: item.product.genericName ?? null,
      barcode: item.product.barcode ?? null,
      dosage: sale.prescription?.items.find((p) => p.productId === item.productId)?.instructions ?? null,
      ...(Array.isArray(item.batches) && item.batches.length > 0 ? { batches: item.batches as unknown as ReceiptBatch[] } : {}),
    })),
    branchName: sale.store.name,
    storeId: sale.storeId,
    subtotal: toNumber(sale.subtotal),
    discountType: sale.discountType ?? "NONE",
    discountName: sale.discountName,
    discountRate: sale.discountRate,
    discountVatExempt: sale.discountVatExempt,
    discountAmount: toNumber(sale.discountAmount),
    discountIdNumber: sale.discountIdNumber ?? undefined,
    discountHolderName: sale.discountHolderName ?? undefined,
    taxAmount: toNumber(sale.taxAmount),
    vatableSales: toNumber(sale.vatableSales),
    nonVatableSales: toNumber(sale.nonVatableSales),
    vatableGross: toNumber(sale.vatableGross),
    nonVatableGross: toNumber(sale.nonVatableGross),
    vatableDiscountAmount: toNumber(sale.vatableDiscountAmount),
    nonVatableDiscountAmount: toNumber(sale.nonVatableDiscountAmount),
    vatRemovedFromVatable: toNumber(sale.vatRemovedFromVatable),
    zeroRatedSales: 0,
    totalAmount: toNumber(sale.totalAmount),
    adjustmentAmount: toNumber(sale.adjustmentAmount),
    adjustmentLabel: sale.adjustmentLabel,
    roundingAmount: toNumber(sale.roundingAmount),
    computedParts: (sale.computedParts as ReceiptData["computedParts"]) ?? null,
    paymentMethod: sale.paymentMethod,
    paymentProvider: sale.paymentProvider,
    paymentReference: sale.paymentReference,
    cashReceived: sale.cashReceived ? toNumber(sale.cashReceived) : undefined,
    changeGiven: sale.changeGiven ? toNumber(sale.changeGiven) : undefined,
    ...(sale.pointsRedeemed !== 0 || sale.pointsEarned !== 0
      ? {
          loyalty: {
            pointsRedeemed: sale.pointsRedeemed,
            pointsAmount: toNumber(sale.pointsAmount),
            pointsEarned: sale.pointsEarned,
            // EARN is written last at checkout, so its balance is the one after
            // the sale; REDEEM when nothing was earned; RETURN on return rows.
            balanceAfter:
              (["EARN", "REDEEM", "RETURN"] as const)
                .map((type) => sale.loyaltyTransactions.find((t) => t.type === type))
                .find(Boolean)?.balanceAfter ?? null,
          },
        }
      : {}),
    orderRemarks: sale.orderRemarks,
    customer: sale.customer ?? undefined,
    cashier: { firstName: (sale.servedBy ?? sale.user).firstName, lastName: (sale.servedBy ?? sale.user).lastName },
    store,
    ...(vatExemptSales !== undefined ? { vatExemptSales } : {}),
    // Receipt designer only (the standard receipt ignores these).
    receiptKind: sale.status === "CANCELLED" ? "VOIDED" : sale.originalSale ? "RETURN" : null,
    originalSaleNumber: sale.originalSale?.saleNumber ?? null,
    returnParts: sale.originalSale ? returnParts(sale, sale.originalSale) : null,
    prescription: sale.prescription
      ? {
          number: sale.prescription.prescriptionNumber,
          doctorName: `${sale.prescription.doctor.firstName} ${sale.prescription.doctor.lastName}`.trim(),
          doctorLicense: sale.prescription.doctor.licenseNumber ?? null,
          instructions: sale.prescription.instructions ?? null,
        }
      : null,
  };
};
