import { prisma } from "@/lib/prisma";
import { getReceiptSettings } from "@/lib/receipt-settings";
import type { ReceiptData } from "@/types/receipt";

const toNumber = (value: unknown) => Number(value ?? 0);

export const buildReceiptDataForSale = async (saleId: string, tenantId: string): Promise<ReceiptData | null> => {
  const sale = await prisma.sale.findFirst({
    where: { id: saleId, tenantId },
    select: {
      id: true,
      saleNumber: true,
      saleDate: true,
      subtotal: true,
      discountType: true,
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
      paymentMethod: true,
      cashReceived: true,
      changeGiven: true,
      orderRemarks: true,
      customer: { select: { firstName: true, lastName: true } },
      user: { select: { firstName: true, lastName: true } },
      store: { select: { name: true, address: true, city: true, isMainBranch: true } },
      items: {
        select: {
          quantity: true,
          unitPrice: true,
          totalPrice: true,
          product: { select: { name: true, isVatable: true } },
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
    sale.discountType === "SENIOR" || sale.discountType === "PWD"
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
    })),
    subtotal: toNumber(sale.subtotal),
    discountType: sale.discountType ?? "NONE",
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
    paymentMethod: sale.paymentMethod,
    cashReceived: sale.cashReceived ? toNumber(sale.cashReceived) : undefined,
    changeGiven: sale.changeGiven ? toNumber(sale.changeGiven) : undefined,
    orderRemarks: sale.orderRemarks,
    customer: sale.customer ?? undefined,
    cashier: { firstName: sale.user.firstName, lastName: sale.user.lastName },
    store,
    ...(vatExemptSales !== undefined ? { vatExemptSales } : {}),
  };
};
