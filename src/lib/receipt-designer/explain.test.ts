// Run: npx tsx --test src/lib/receipt-designer/explain.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import type { ReceiptData, ReceiptStoreSettings } from "@/types/receipt";
import { calculateVatInclusiveTotals } from "@/lib/vat-calculations";
import { applyPricing, NO_PRICING, type PricingRules } from "@/lib/pricing";
import { computeFormula } from "./formula";
import { TOTALS_FIELDS, TOTALS_KEYS } from "./totals";
import { computationAsLines, explainKey, explainPart, withNumbers } from "./explain";
import { buildPreset } from "./presets";
import { layoutReceipt } from "./layout";
import { toPrintedLines } from "./textmode";
import { newBlock } from "./blocks";
import { sampleReceipt } from "./samples";
import type { Block, Template, TotalsKey } from "./types";

const store: ReceiptStoreSettings = {
  storeName: "Botika", receiptTitle: "AR", addressLine1: "Rizal Ave.", footerMessage: "Salamat!",
  showVatBreakdown: true, showCashierName: true, showCustomerName: true, includeOrderRemarks: true,
};

let seed = 4242;
const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const DISCOUNTS = [
  {},
  { discountType: "SENIOR", discountPercent: 20 },
  { discountType: "PWD", discountPercent: 20 },
  { discountType: "PROMO", discountPercent: 10, vatExempt: false, rate: "10%" },
  { discountType: "FIX", discountPercent: 0, fixedAmount: 50, vatExempt: false, rate: "₱50.00" },
  { discountType: "CAP", discountPercent: 15, maxAmount: 30, vatExempt: false, rate: "15%" },
  { discountType: "EX5", discountPercent: 5, vatExempt: true, rate: "5%" },
];

// A sale as saved and read back for a receipt (see receipt-data.ts).
function sale(i: number): { r: ReceiptData; adjusted: boolean } {
  const n = 1 + Math.floor(rand() * 5);
  const items: ReceiptData["items"] = [];
  for (let k = 0; k < n; k++) {
    const quantity = 1 + Math.floor(rand() * 20);
    const unitPrice = Math.round(rand() * 40000) / 100;
    items.push({ name: `Item ${k}`, quantity, unitPrice, totalPrice: Math.round(quantity * unitPrice * 100) / 100, isVatable: rand() < 0.6 });
  }
  const vatableTotal = Number(items.filter((x) => x.isVatable).reduce((s, x) => s + x.totalPrice, 0).toFixed(2));
  const nonVatableTotal = Number(items.filter((x) => !x.isVatable).reduce((s, x) => s + x.totalPrice, 0).toFixed(2));
  const d = DISCOUNTS[i % DISCOUNTS.length] as Record<string, unknown>;
  const computed = calculateVatInclusiveTotals({ vatableTotal, nonVatableTotal, ...d });
  const exempt = d.discountType === "SENIOR" || d.discountType === "PWD" || d.vatExempt === true;
  const rules: PricingRules = i % 5 === 4 ? { roundingStep: 0.25, rule: i % 10 === 9 ? { label: "Fee", expr: "total * 1.03" } : null } : NO_PRICING;
  const p = applyPricing(computed, { exemptSale: exempt, paymentMethod: "CASH", items }, rules);
  const t = p.totals;
  const hasDiscount = "discountType" in d;
  const cash = Math.ceil(t.finalTotal / 100) * 100 + 100;
  const r: ReceiptData = {
    saleNumber: "AR-1", date: new Date("2026-11-26T02:00:00Z"), items, store, cashier: { firstName: "A", lastName: "B" },
    subtotal: t.subtotal, discountType: hasDiscount ? (d.discountType as string) : "NONE", discountName: hasDiscount ? (d.discountType as string) : null,
    discountRate: hasDiscount ? ((d.rate as string) ?? "20%") : null, discountVatExempt: exempt, discountAmount: t.discountAmount,
    taxAmount: t.vatAmount, vatableSales: t.vatableSales, nonVatableSales: t.nonVatableSales, vatableGross: t.vatableGross, nonVatableGross: t.nonVatableGross,
    vatableDiscountAmount: t.vatableDiscountAmount, nonVatableDiscountAmount: t.nonVatableDiscountAmount, vatRemovedFromVatable: t.vatRemovedFromVatable,
    ...(exempt && hasDiscount ? { vatExemptSales: Math.round((t.vatableGross - t.vatRemovedFromVatable) * 100) / 100 } : {}),
    zeroRatedSales: 0, totalAmount: t.finalTotal, adjustmentAmount: p.adjustmentAmount, adjustmentLabel: p.adjustmentLabel, roundingAmount: p.roundingAmount,
    computedParts: p.computedParts, paymentMethod: "CASH", cashReceived: cash, changeGiven: Math.round((cash - t.finalTotal) * 100) / 100,
  };
  return { r, adjusted: p.adjustmentAmount !== 0 || p.roundingAmount !== 0 };
}

// Spread over VAT parts by the price formula / rounding, so recomputing them from the gross can't match.
const PARTS_SPREAD: TotalsKey[] = ["vatAmount", "vatableSales", "nonVatableSales"];

test("every formula gives exactly the figure saved with the sale (20,000 sales)", () => {
  let checked = 0;
  for (let i = 0; i < 20_000; i++) {
    const { r, adjusted } = sale(i);
    for (const key of TOTALS_KEYS) {
      if (TOTALS_FIELDS[key].format !== "money") continue;
      const e = explainKey(key, r);
      if (!e.formula || (adjusted && PARTS_SPREAD.includes(key))) continue;
      const saved = TOTALS_FIELDS[key].value(r);
      const got = computeFormula(e.formula, r);
      if (saved === null && got === null) continue; // doesn't apply to this sale either way
      const want = typeof saved === "number" ? saved : 0;
      assert.ok(got !== null && Math.abs(got - want) < 0.005, `sale ${i} ${key}: formula ${e.formula} = ${got}, saved ${saved}`);
      checked++;
    }
  }
  assert.ok(checked > 150_000, `checked ${checked}`);
});

test("the explanation ends at the figure the receipt prints", () => {
  for (let i = 0; i < 2_000; i++) {
    const { r, adjusted } = sale(i);
    for (const key of ["grossTotal", "vatRemoved", "vatExemptSales", "discount", "vatAmount", "vatableSales", "totalDue", "change"] as TotalsKey[]) {
      if (adjusted && PARTS_SPREAD.includes(key)) continue;
      const e = explainKey(key, r);
      const last = e.steps.join(" ");
      if (e.value && e.value !== "0.00") assert.ok(last.includes(e.value), `sale ${i} ${key}: "${last}" should show ${e.value}`);
    }
  }
});

test("the user's example: Less 12% VAT = 39.96 on a ₱373.00 Senior sale", () => {
  const r = sampleReceipt("scpwd", store, { firstName: "A", lastName: "B" }, null);
  const e = explainKey("vatRemoved", r);
  assert.equal(e.value, "39.96");
  assert.ok(e.steps.some((s) => s.includes("373.00 ÷ 1.12 = 333.04")), e.steps.join("\n"));
  assert.ok(e.steps.some((s) => s.includes("373.00 − 333.04 = 39.96")));
  assert.equal(withNumbers("vatableGross - cents(vatableGross / 1.12)", r), "373.00 - cents(373.00 / 1.12)");
  const total = explainKey("totalDue", r);
  assert.ok(total.steps.some((s) => s.includes("333.04 + items without VAT 32.50 = 365.54")), total.steps.join("\n"));
  assert.ok(total.steps.some((s) => s.includes("365.54 − 73.11 = 292.43")));
});

const amounts = (t: Template, r: ReceiptData) =>
  toPrintedLines(layoutReceipt(t, r), 80)
    .flatMap((l) => (l.kind === "text" ? l.text.match(/-?₱[\d,]+\.\d\d/g) ?? [] : []))
    .map((s) => s.replace(/[₱,]/g, ""))
    .filter((s) => Number(s) !== 0); // split lines hide steps that come to zero

test("split into lines: the same amounts as the step-by-step block, for every kind of sale", () => {
  const base = buildPreset("classic", store, 80);
  const totals = (lines: Extract<Block, { type: "totals" }>["lines"]): Template => ({ ...base, blocks: [{ ...(newBlock("totals") as Extract<Block, { type: "totals" }>), lines }] });
  for (let i = 0; i < 3_000; i++) {
    const { r } = sale(i);
    const before = amounts(totals([{ id: "c", kind: "computation", style: {} }]), r);
    const after = amounts(totals(computationAsLines()), r);
    const show = (t: Template) => toPrintedLines(layoutReceipt(t, r), 80).map((l) => (l.kind === "text" ? l.text : "")).join(" | ");
    assert.deepEqual(after, before, `sale ${i}: ${show(totals([{ id: "c", kind: "computation", style: {} }]))} --- ${show(totals(computationAsLines()))}`);
  }
});

test("every part of a preset can be explained", () => {
  for (const kind of ["regular", "scpwd", "points", "ewallet", "rx", "return"] as const) {
    const r = sampleReceipt(kind, store, { firstName: "A", lastName: "B" }, null);
    for (const key of ["classic", "chain", "register", "compact", "promo"] as const) {
      for (const b of buildPreset(key, store, 58).blocks) {
        const parts = explainPart(b, null, r);
        assert.ok(parts.length > 0 && parts.every((p) => p.title && p.source), `${kind} ${key} ${b.type}`);
      }
    }
  }
});

test("each part of the discount is explained with its own items", () => {
  const r = sampleReceipt("scpwd", store, { firstName: "A", lastName: "B" }, null);
  const vat = explainKey("vatableDiscount", r).steps.join(" | ");
  const non = explainKey("nonVatableDiscount", r).steps.join(" | ");
  assert.match(vat, /20% of 333\.04 = 66\.61/);
  assert.doesNotMatch(vat, /32\.50/);
  assert.match(non, /20% of 32\.50 = 6\.50/);
  assert.doesNotMatch(non, /333\.04/);
  // In the step-by-step list, the -66.61 step is explained by 333.04, the -6.50 step by 32.50.
  const steps = explainPart({ ...buildPreset("classic", store, 58).blocks.find((b) => b.type === "totals")! } as Block, null, r)[0].steps;
  assert.ok(steps.some((s) => s.includes("-66.61") && s.includes("20% of 333.04 = 66.61")), steps.join("\n"));
  assert.ok(steps.some((s) => s.includes("-6.50") && s.includes("20% of 32.50 = 6.50")), steps.join("\n"));
});
