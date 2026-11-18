import type { ReceiptData, ReceiptItem, ReceiptStoreSettings } from "@/types/receipt";
import { calculateVatInclusiveTotals } from "@/lib/vat-calculations";

export type SampleKind = "regular" | "scpwd" | "points" | "ewallet";

export const SAMPLE_KINDS: { key: SampleKind | "recent"; label: string }[] = [
  { key: "regular", label: "Regular sale" },
  { key: "scpwd", label: "Senior citizen" },
  { key: "points", label: "With loyalty points" },
  { key: "ewallet", label: "E-wallet" },
  { key: "recent", label: "Your latest sale" },
];

const ITEMS: ReceiptItem[] = [
  { name: "Biogesic 500mg Tablet", genericName: "Paracetamol", quantity: 2, unitPrice: 6.5, totalPrice: 13, isVatable: true },
  { name: "Losartan 50mg Tablet", genericName: "Losartan Potassium", quantity: 30, unitPrice: 12, totalPrice: 360, isVatable: true },
  { name: "Ascorbic Acid 500mg Capsule", genericName: "Vitamin C", quantity: 10, unitPrice: 3.25, totalPrice: 32.5, isVatable: false },
];

// A made-up sale for the designer's preview, computed with the same VAT and
// discount math as real checkouts so every totals line shows a real figure.
export function sampleReceipt(
  kind: SampleKind,
  store: ReceiptStoreSettings,
  cashier: { firstName: string; lastName: string },
  branchName: string | null
): ReceiptData {
  const vatableTotal = ITEMS.filter((i) => i.isVatable).reduce((s, i) => s + i.totalPrice, 0);
  const nonVatableTotal = ITEMS.filter((i) => !i.isVatable).reduce((s, i) => s + i.totalPrice, 0);
  const sc = kind === "scpwd";
  const t = calculateVatInclusiveTotals({ vatableTotal, nonVatableTotal, ...(sc ? { discountType: "SENIOR", discountPercent: 20 } : {}) });
  const total = t.finalTotal;
  const pointsAmount = kind === "points" ? 50 : 0;
  const due = Math.round((total - pointsAmount) * 100) / 100;
  const cash = Math.ceil(due / 100) * 100;

  return {
    saleNumber: "AR-SAMPLE-0001",
    date: new Date(),
    branchName,
    items: ITEMS,
    subtotal: t.subtotal,
    discountType: sc ? "SENIOR" : "NONE",
    discountName: sc ? "Senior Citizen" : null,
    discountRate: sc ? "20%" : null,
    discountVatExempt: sc,
    discountAmount: t.discountAmount,
    discountHolderName: sc ? "Juan dela Cruz" : undefined,
    discountIdNumber: sc ? "OSCA-000123" : undefined,
    taxAmount: t.vatAmount,
    vatableSales: t.vatableSales,
    nonVatableSales: t.nonVatableSales,
    zeroRatedSales: 0,
    vatableGross: t.vatableGross,
    nonVatableGross: t.nonVatableGross,
    vatableDiscountAmount: t.vatableDiscountAmount,
    nonVatableDiscountAmount: t.nonVatableDiscountAmount,
    vatRemovedFromVatable: t.vatRemovedFromVatable,
    ...(sc ? { vatExemptSales: Math.round((t.vatableGross - t.vatRemovedFromVatable) * 100) / 100 } : {}),
    totalAmount: total,
    paymentMethod: kind === "ewallet" ? "E_WALLET" : "CASH",
    paymentProvider: kind === "ewallet" ? "GCash" : null,
    paymentReference: kind === "ewallet" ? "1234 567 890123" : null,
    cashReceived: kind === "ewallet" ? undefined : cash,
    changeGiven: kind === "ewallet" ? undefined : Math.round((cash - due) * 100) / 100,
    ...(kind === "points"
      ? { loyalty: { pointsRedeemed: 50, pointsAmount: 50, pointsEarned: Math.floor(due / 50), balanceAfter: 75 + Math.floor(due / 50) } }
      : {}),
    customer: sc || kind === "points" ? { firstName: "Juan", lastName: "dela Cruz" } : undefined,
    cashier,
    orderRemarks: "Take 1 tablet every 6 hours as needed for fever.",
    store,
  };
}
