// The VAT split of a return (RET-) row, for designed receipts. Pure, so the
// designer's sample receipts can use it in the browser too.
import type { ReturnParts } from "@/types/receipt";

const toNumber = (value: unknown) => Number(value ?? 0);
const cents = (n: number) => Math.round(n * 100) / 100;

type Amount = Parameters<typeof toNumber>[0];
interface SaleSplit {
  subtotal: Amount; totalAmount?: Amount; vatableSales?: Amount; nonVatableSales?: Amount; vatableGross?: Amount; nonVatableGross?: Amount;
  vatableDiscountAmount?: Amount; nonVatableDiscountAmount?: Amount; vatRemovedFromVatable?: Amount;
  discountType?: string | null; discountName?: string | null; discountRate?: string | null; discountVatExempt?: boolean;
}

// A return row saves only its subtotal, VAT, discount and total. Its VAT split
// is the original sale's, in the share that was returned (the same share the
// return's VAT and total were worked out with), negative like its amounts.
// On a regular sale VATable sales is what's left after VAT and non-VAT, so the
// parts add up; on an SC/PWD sale the VATable items are VAT-exempt instead.
export function returnParts(ret: { subtotal: Amount; taxAmount: Amount; totalAmount: Amount }, orig: SaleSplit): ReturnParts {
  const origSubtotal = toNumber(orig.subtotal);
  const share = origSubtotal !== 0 ? toNumber(ret.subtotal) / origSubtotal : 0; // negative
  const part = (v: Amount) => cents(toNumber(v) * share);
  const nonVatableSales = part(orig.nonVatableSales);
  const vatableGross = part(orig.vatableGross);
  const vatRemovedFromVatable = part(orig.vatRemovedFromVatable);
  const exempt = orig.discountVatExempt || orig.discountType === "SENIOR" || orig.discountType === "PWD";
  return {
    vatableSales: exempt ? part(orig.vatableSales) : cents(toNumber(ret.totalAmount) - toNumber(ret.taxAmount) - nonVatableSales),
    nonVatableSales,
    vatableGross,
    nonVatableGross: part(orig.nonVatableGross),
    vatableDiscountAmount: part(orig.vatableDiscountAmount),
    nonVatableDiscountAmount: part(orig.nonVatableDiscountAmount),
    vatRemovedFromVatable,
    ...(exempt ? { vatExemptSales: cents(vatableGross - vatRemovedFromVatable) } : {}),
    discountType: orig.discountType ?? "NONE",
    discountName: orig.discountName ?? null,
    discountRate: orig.discountRate ?? null,
    discountVatExempt: Boolean(orig.discountVatExempt),
  };
}

