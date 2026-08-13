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
      taxAmount: true,
      vatableSales: true,
      nonVatableSales: true,
      totalAmount: true,
      paymentMethod: true,
      cashReceived: true,
      changeGiven: true,
      orderRemarks: true,
      customer: { select: { firstName: true, lastName: true } },
      user: { select: { firstName: true, lastName: true } },
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

  const store = await getReceiptSettings(tenantId);

  let vatExemptSales: number | undefined;
  if (sale.discountType === "SENIOR" || sale.discountType === "PWD") {
    // sale.vatableSales is already VAT-exclusive and net of the 20% discount for SENIOR/PWD sales.
    vatExemptSales = Number((toNumber(sale.vatableSales) / 0.8).toFixed(2));
  }

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
    taxAmount: toNumber(sale.taxAmount),
    vatableSales: toNumber(sale.vatableSales),
    nonVatableSales: toNumber(sale.nonVatableSales),
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
