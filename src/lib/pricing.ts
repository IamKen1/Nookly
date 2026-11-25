// What the POS charges beyond the standard VAT/discount computation: the
// owner's own formula and cash rounding (Receipt designer › Apply to POS).
// Pure, so the checkout screen and the server compute exactly the same thing.
//
//   computed total ──formula──▶ adjusted ──cash rounding down──▶ charged
//
// The difference is spread over the VATable and non-VAT parts and VAT is
// recomputed, so vatableSales + vatAmount + nonVatableSales = charged total
// holds for every sale, and reports, shift cash and returns stay consistent.
import type { ReceiptData } from "@/types/receipt";
import type { VatCalculationResult } from "@/lib/vat-calculations";
import { computeFormula, formulaVariables, FormulaError } from "@/lib/receipt-designer/formula";

export interface PricingRules {
  roundingStep: number | null; // ₱0.25 / ₱0.50 / ₱1.00; null = off
  rule: { label: string; expr: string; when?: RuleWhen } | null; // null = off
}

// When the formula applies. Absent = every sale (except SC/PWD, always).
export interface RuleWhen {
  payment: "any" | "CASH" | "E_WALLET";
  minTotal: number | null; // computed total at least
  maxTotal: number | null; // at most
}

export const ANY_SALE: RuleWhen = { payment: "any", minTotal: null, maxTotal: null };

const peso = (n: number) => `₱${n.toFixed(2)}`;

// "e-wallet sales of ₱1000.00 or more", or "" for every sale.
export function describeWhen(w: RuleWhen | undefined): string {
  if (!w) return "";
  const kind = w.payment === "CASH" ? "cash sales" : w.payment === "E_WALLET" ? "e-wallet sales" : "sales";
  const min = w.minTotal != null ? peso(w.minTotal) : null;
  const max = w.maxTotal != null ? peso(w.maxTotal) : null;
  const range = min && max ? `from ${min} to ${max}` : min ? `of ${min} or more` : max ? `up to ${max}` : "";
  if (!range && w.payment === "any") return "";
  return range ? `${kind} ${range}` : kind;
}

// Why the formula doesn't apply to this sale, or null when it does.
function whenMisses(w: RuleWhen | undefined, paymentMethod: string, computed: number): string | null {
  if (!w) return null;
  const miss =
    (w.payment !== "any" && w.payment !== paymentMethod) ||
    (w.minTotal != null && computed < w.minTotal - 0.005) ||
    (w.maxTotal != null && computed > w.maxTotal + 0.005);
  return miss ? `Only on ${describeWhen(w)}.` : null;
}

export const NO_PRICING: PricingRules = { roundingStep: null, rule: null };
export const ROUNDING_STEPS = [0.25, 0.5, 1] as const;
// A formula result further than this from the computed total is ignored.
export const RULE_MAX_CHANGE = 0.2;

// Values a pricing formula may use: everything known before the customer pays.
export const RULE_VARIABLES = ["subtotal", "total", "vat", "vatableSales", "vatExempt", "zeroRated", "nonVat", "vatableGross", "nonVatGross", "discount", "vatRemoved", "savings", "pieces", "products"];

// Why a pricing formula can't be used, or null when it's fine.
export function ruleError(expr: string): string | null {
  if (!expr.trim()) return "Type a formula.";
  try {
    const bad = formulaVariables(expr).filter((v) => !RULE_VARIABLES.includes(v));
    return bad.length ? `"${bad[0]}" isn't known until the customer pays, so it can't set the price.` : null;
  } catch (e) {
    return e instanceof FormulaError ? e.message : "This formula can't be read.";
  }
}

export interface PricingContext {
  exemptSale: boolean; // SC/PWD or another VAT-exempt discount: the formula never applies
  paymentMethod: string; // rounding applies to CASH only
  items: { quantity: number }[];
}

export interface PricingResult {
  totals: VatCalculationResult; // finalTotal and the VAT parts as charged
  computedTotal: number; // before any rule
  adjustmentAmount: number;
  adjustmentLabel: string | null;
  roundingAmount: number;
  ruleSkipped: string | null; // why a switched-on formula didn't apply to this sale
  // The standard computation's parts, saved on adjusted sales only (null otherwise).
  computedParts: ComputedParts | null;
}

export interface ComputedParts {
  vatableSales: number;
  vatAmount: number;
  nonVatableSales: number;
  finalTotal: number;
}

const money = (n: number) => Number(n.toFixed(2));

// The sale as the formula engine sees it (same names as on receipts).
function formulaSale(t: VatCalculationResult, items: { quantity: number }[]): ReceiptData {
  return {
    subtotal: t.subtotal,
    discountAmount: t.discountAmount,
    vatRemovedFromVatable: t.vatRemovedFromVatable,
    vatableSales: t.vatableSales,
    vatExemptSales: t.vatExemptSales ?? 0,
    zeroRatedSales: 0,
    nonVatableSales: t.nonVatableSales,
    vatableGross: t.vatableGross,
    nonVatableGross: t.nonVatableGross,
    taxAmount: t.vatAmount,
    totalAmount: t.finalTotal,
    items: items.map((i) => ({ name: "", quantity: i.quantity, unitPrice: 0, totalPrice: 0, isVatable: true })),
  } as unknown as ReceiptData;
}

// Moves the total by `delta`, split over the VATable and non-VAT parts by size.
function shift(t: VatCalculationResult, delta: number, exemptSale: boolean): VatCalculationResult {
  if (Math.abs(delta) < 0.005) return t;
  // The VATable part as charged: VAT-inclusive on regular sales, VAT-exempt on SC/PWD.
  const vatablePart = exemptSale ? t.vatableSales : money(t.vatableSales + t.vatAmount);
  const base = vatablePart + t.nonVatableSales;
  const toVatable = base > 0 ? money((delta * vatablePart) / base) : 0;
  const toNonVat = money(delta - toVatable);
  const nonVatableSales = money(t.nonVatableSales + toNonVat);
  let vatableSales: number;
  let vatAmount: number;
  if (exemptSale) {
    vatableSales = money(t.vatableSales + toVatable);
    vatAmount = t.vatAmount;
  } else {
    const inclusive = money(vatablePart + toVatable);
    vatAmount = money(inclusive * (12 / 112));
    vatableSales = money(inclusive - vatAmount);
  }
  return { ...t, vatableSales, vatAmount, nonVatableSales, finalTotal: money(vatableSales + vatAmount + nonVatableSales) };
}

export function applyPricing(totals: VatCalculationResult, ctx: PricingContext, rules: PricingRules): PricingResult {
  const computed = totals.finalTotal;
  let t = totals;
  let adjustmentAmount = 0;
  let ruleSkipped: string | null = null;

  // 1. the owner's formula
  if (rules.rule && rules.rule.expr.trim()) {
    const misses = whenMisses(rules.rule.when, ctx.paymentMethod, computed);
    if (ctx.exemptSale) ruleSkipped = "SC/PWD and VAT-exempt discounts always use the standard computation.";
    else if (misses) ruleSkipped = misses;
    else if (ruleError(rules.rule.expr)) ruleSkipped = "The formula can't be used.";
    else {
      const v = computeFormula(rules.rule.expr, formulaSale(t, ctx.items));
      if (v === null || !Number.isFinite(v) || v < 0) ruleSkipped = "The formula has no answer for this sale.";
      else if (Math.abs(v - computed) > computed * RULE_MAX_CHANGE + 0.005)
        ruleSkipped = `The formula's ₱${v.toFixed(2)} is more than ${RULE_MAX_CHANGE * 100}% away from the computed ₱${computed.toFixed(2)}.`;
      else {
        t = shift(t, money(v - computed), ctx.exemptSale);
        adjustmentAmount = money(t.finalTotal - computed);
      }
    }
  }

  // 2. cash rounding, always down, never to ₱0
  let roundingAmount = 0;
  const step = rules.roundingStep;
  if (step && step > 0 && ctx.paymentMethod === "CASH") {
    const cents = Math.round(t.finalTotal * 100);
    const stepCents = Math.round(step * 100);
    const down = Math.floor(cents / stepCents) * stepCents;
    if (down > 0 && down < cents) {
      const before = t.finalTotal;
      t = shift(t, money((down - cents) / 100), ctx.exemptSale);
      roundingAmount = money(t.finalTotal - before);
    }
  }

  return {
    totals: t,
    computedTotal: computed,
    adjustmentAmount,
    adjustmentLabel: adjustmentAmount !== 0 ? rules.rule?.label.trim() || "Adjustment" : null,
    roundingAmount,
    ruleSkipped,
    computedParts:
      adjustmentAmount !== 0 || roundingAmount !== 0
        ? { vatableSales: totals.vatableSales, vatAmount: totals.vatAmount, nonVatableSales: totals.nonVatableSales, finalTotal: totals.finalTotal }
        : null,
  };
}
