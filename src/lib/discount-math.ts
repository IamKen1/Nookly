// Discount helpers shared by the checkout screen and the server (no database
// access here, so the browser can use them too).

const LEGACY_CODES = new Set(["SENIOR", "PWD", "STUDENT", "EMPLOYEE"]);

export interface DiscountTerms {
  code: string;
  name: string;
  kind: string; // PERCENT or FIXED
  value: number;
  maxAmount: number | null;
  vatExempt: boolean;
}

const pesoText = (n: number) => `₱${n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// "20%", "₱50.00", or "10% up to ₱100.00" — shown at checkout and saved on the sale.
export function discountRateText(d: Pick<DiscountTerms, "kind" | "value" | "maxAmount">) {
  const base = d.kind === "FIXED" ? pesoText(d.value) : `${Number(d.value.toFixed(2))}%`;
  return d.kind !== "FIXED" && d.maxAmount != null ? `${base} up to ${pesoText(d.maxAmount)}` : base;
}

// What the checkout and the server both feed into the VAT calculation.
export function discountCalcInput(d: Omit<DiscountTerms, "name">) {
  return {
    discountType: d.code,
    discountPercent: d.kind === "FIXED" ? 0 : d.value,
    fixedAmount: d.kind === "FIXED" ? d.value : null,
    maxAmount: d.kind === "FIXED" ? null : d.maxAmount,
    vatExempt: d.vatExempt,
  };
}

// How the discount line reads on the computation: the code for the built-in
// discounts (unchanged receipts), the name for a workspace's own.
export function discountDisplay(d: DiscountTerms) {
  return LEGACY_CODES.has(d.code) && d.kind !== "FIXED" && d.maxAmount == null
    ? { vatExempt: d.vatExempt }
    : { label: d.name, rate: discountRateText(d), vatExempt: d.vatExempt };
}

