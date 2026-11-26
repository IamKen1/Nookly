import type { ReceiptData, ReceiptItem, ReceiptStoreSettings } from "@/types/receipt";
import { calculateVatInclusiveTotals } from "@/lib/vat-calculations";
import { applyPricing, NO_PRICING, vatOptions, type PricingRules } from "@/lib/pricing";
import { returnParts } from "@/lib/return-parts";
import { discountCalcInput, discountRateText, type DiscountTerms as Terms } from "@/lib/discount-math";

type DiscountTerms = Terms & { asksForId?: boolean };

export type SampleKind = "regular" | "scpwd" | "points" | "ewallet" | "discount" | "rx" | "return" | "voided";

export const SAMPLE_KINDS: { key: SampleKind | "recent"; label: string }[] = [
  { key: "regular", label: "Regular sale" },
  { key: "scpwd", label: "Senior citizen" },
  { key: "points", label: "With loyalty points" },
  { key: "ewallet", label: "E-wallet" },
  { key: "rx", label: "With a prescription" },
  { key: "return", label: "Return / refund" },
  { key: "voided", label: "Voided sale" },
  { key: "recent", label: "Your latest sale" },
];

const ITEMS: ReceiptItem[] = [
  {
    name: "Biogesic 500mg Tablet", genericName: "Paracetamol", barcode: "4800010012345", quantity: 2, unitPrice: 6.5, totalPrice: 13, isVatable: true,
    batches: [{ lot: "BG24117", expiry: "2027-03-31", quantity: 2 }],
  },
  {
    name: "Losartan 50mg Tablet", genericName: "Losartan Potassium", barcode: "4800020067890", quantity: 30, unitPrice: 12, totalPrice: 360, isVatable: true,
    batches: [{ lot: "LS0921", expiry: "2026-12-15", quantity: 20 }, { lot: "LS1003", expiry: "2027-06-30", quantity: 10 }],
  },
  { name: "Ascorbic Acid 500mg Capsule", genericName: "Vitamin C", barcode: "4800030011223", quantity: 10, unitPrice: 3.25, totalPrice: 32.5, isVatable: false },
];

// Example checkouts for "Apply to POS" dialogs: before → after with the owner's
// rules. `discount` swaps in a discount's terms to show what changing it does.
export function exampleCheckouts(
  rules: PricingRules,
  discount?: { code: string; kind: string; value: number; maxAmount: number | null; vatExempt: boolean }
) {
  const vatableTotal = ITEMS.filter((i) => i.isVatable).reduce((s, i) => s + i.totalPrice, 0);
  const nonVatableTotal = ITEMS.filter((i) => !i.isVatable).reduce((s, i) => s + i.totalPrice, 0);
  const carts: { label: string; vatableTotal: number; nonVatableTotal: number; sc?: boolean; method: string }[] = discount
    ? [{ label: `Sample sale with "${discount.code}"`, vatableTotal, nonVatableTotal, method: "CASH" }]
    : [
        { label: "Sample sale, cash", vatableTotal, nonVatableTotal, method: "CASH" },
        { label: "Same sale, GCash", vatableTotal, nonVatableTotal, method: "E_WALLET" },
        { label: "Senior citizen, cash", vatableTotal, nonVatableTotal, sc: true, method: "CASH" },
        { label: "Small sale, cash", vatableTotal: 123.45, nonVatableTotal: 0, method: "CASH" },
        { label: "Big sale, cash", vatableTotal: 1548.15, nonVatableTotal: 210.3, method: "CASH" },
      ];
  return carts.map((c) => {
    const input = discount
      ? {
          discountType: discount.code,
          discountPercent: discount.kind === "FIXED" ? 0 : discount.value,
          fixedAmount: discount.kind === "FIXED" ? discount.value : null,
          maxAmount: discount.kind === "FIXED" ? null : discount.maxAmount,
          vatExempt: discount.vatExempt,
        }
      : c.sc
      ? { discountType: "SENIOR", discountPercent: 20 }
      : {};
    // Under the owner's VAT settings, like a real checkout.
    const vat = vatOptions(rules, discount ? { code: discount.code, vatExempt: discount.vatExempt } : c.sc ? { code: "SENIOR", vatExempt: true } : null);
    const computed = calculateVatInclusiveTotals({ vatableTotal: c.vatableTotal, nonVatableTotal: c.nonVatableTotal, ...input, ...("discountType" in input ? { vatExempt: vat.vatExempt } : {}), vatRate: vat.vatRate });
    const exemptSale = vat.vatExempt;
    const priced = applyPricing(computed, { exemptSale, paymentMethod: c.method, items: ITEMS }, rules);
    return { label: c.label, gross: computed.subtotal, computed: computed.finalTotal, charged: priced.totals.finalTotal, note: priced.ruleSkipped, discountAmount: computed.discountAmount };
  });
}

const RX_DOSAGE: Record<string, string> = {
  "Losartan 50mg Tablet": "1 tablet once a day in the morning",
  "Biogesic 500mg Tablet": "1 tablet every 6 hours as needed for fever",
};

// A made-up sale for the designer's preview. "return" is two Biogesic brought
// back from the regular sale; "voided" is the regular sale, cancelled.
export function sampleReceipt(
  kind: SampleKind,
  store: ReceiptStoreSettings,
  cashier: { firstName: string; lastName: string },
  branchName: string | null,
  storeId: string | null = null,
  pricing: PricingRules = NO_PRICING,
  discount: DiscountTerms | null = null
): ReceiptData {
  const base = saleSample(kind === "return" || kind === "voided" || kind === "rx" ? "regular" : kind, store, cashier, branchName, storeId, pricing, discount);
  if (kind === "voided") return { ...base, receiptKind: "VOIDED" };
  if (kind === "rx") {
    return {
      ...base,
      items: base.items.map((i) => ({ ...i, dosage: RX_DOSAGE[i.name] ?? null })),
      prescription: { number: "RX-2026-00042", doctorName: "Maria Santos, MD", doctorLicense: "0123456", instructions: "Maintenance for blood pressure." },
    };
  }
  if (kind !== "return") return base;
  const item = base.items[0];
  const subtotal = -item.totalPrice;
  const share = subtotal / base.subtotal;
  const ret = { subtotal, taxAmount: Math.round(base.taxAmount * share * 100) / 100, totalAmount: Math.round(base.totalAmount * share * 100) / 100 };
  return {
    ...base,
    saleNumber: "RET-SAMPLE-0001",
    items: [{ ...item, totalPrice: -item.totalPrice, batches: undefined }],
    ...ret,
    discountAmount: 0,
    vatableSales: 0,
    nonVatableSales: 0,
    adjustmentAmount: 0,
    roundingAmount: 0,
    computedParts: null,
    cashReceived: undefined,
    changeGiven: undefined,
    loyalty: undefined,
    orderRemarks: `Return for ${base.saleNumber}: wrong item`,
    receiptKind: "RETURN",
    originalSaleNumber: base.saleNumber,
    returnParts: returnParts(ret, base),
  };
}

// A made-up sale for the designer's preview, computed with the same VAT and
// discount math as real checkouts so every totals line shows a real figure.
function saleSample(
  kind: SampleKind,
  store: ReceiptStoreSettings,
  cashier: { firstName: string; lastName: string },
  branchName: string | null,
  storeId: string | null = null,
  pricing: PricingRules = NO_PRICING, // the owner's POS pricing rules, applied like a real checkout
  discount: DiscountTerms | null = null // kind "discount": one of the workspace's own discounts
): ReceiptData {
  const vatableTotal = ITEMS.filter((i) => i.isVatable).reduce((s, i) => s + i.totalPrice, 0);
  const nonVatableTotal = ITEMS.filter((i) => !i.isVatable).reduce((s, i) => s + i.totalPrice, 0);
  const own = kind === "discount" && discount ? discount : null;
  const sc = kind === "scpwd";
  const vat = vatOptions(pricing, sc ? { code: "SENIOR", vatExempt: true } : own ? { code: own.code, vatExempt: own.vatExempt } : null);
  const computed = calculateVatInclusiveTotals({
    vatableTotal,
    nonVatableTotal,
    ...(sc ? { discountType: "SENIOR", discountPercent: 20 } : own ? discountCalcInput(own) : {}),
    ...(sc || own ? { vatExempt: vat.vatExempt } : {}),
    vatRate: vat.vatRate,
  });
  const exempt = vat.vatExempt;
  const priced = applyPricing(computed, { exemptSale: exempt, paymentMethod: kind === "ewallet" ? "E_WALLET" : "CASH", items: ITEMS }, pricing);
  const t = priced.totals;
  const total = t.finalTotal;
  const pointsAmount = kind === "points" ? 50 : 0;
  const due = Math.round((total - pointsAmount) * 100) / 100;
  const cash = Math.ceil(due / 100) * 100;

  return {
    saleNumber: "AR-SAMPLE-0001",
    date: new Date(),
    branchName,
    storeId,
    items: ITEMS,
    subtotal: t.subtotal,
    discountType: sc ? "SENIOR" : own ? own.code : "NONE",
    discountName: sc ? "Senior Citizen" : own ? own.name : null,
    discountRate: sc ? "20%" : own ? discountRateText(own) : null,
    discountVatExempt: exempt,
    discountAmount: t.discountAmount,
    discountHolderName: sc || own?.asksForId ? "Juan dela Cruz" : undefined,
    discountIdNumber: sc ? "OSCA-000123" : own?.asksForId ? "ID-000123" : undefined,
    taxAmount: t.vatAmount,
    vatableSales: t.vatableSales,
    nonVatableSales: t.nonVatableSales,
    zeroRatedSales: 0,
    vatableGross: t.vatableGross,
    nonVatableGross: t.nonVatableGross,
    vatableDiscountAmount: t.vatableDiscountAmount,
    nonVatableDiscountAmount: t.nonVatableDiscountAmount,
    vatRemovedFromVatable: t.vatRemovedFromVatable,
    ...(exempt ? { vatExemptSales: Math.round((t.vatableGross - t.vatRemovedFromVatable) * 100) / 100 } : {}),
    totalAmount: total,
    adjustmentAmount: priced.adjustmentAmount,
    adjustmentLabel: priced.adjustmentLabel,
    roundingAmount: priced.roundingAmount,
    computedParts: priced.computedParts,
    ...(vat.vatRate !== 12 ? { vatRate: vat.vatRate } : {}),
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
