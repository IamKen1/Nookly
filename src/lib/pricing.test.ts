// Run: npx tsx --test src/lib/pricing.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateVatInclusiveTotals } from "@/lib/vat-calculations";
import { applyPricing, NO_PRICING, ruleError, type PricingRules } from "./pricing";
import { buildComputationLines, generateReceiptHTML, generateThermalReceiptText } from "@/lib/receipt";
import type { ReceiptData } from "@/types/receipt";

// Deterministic pseudo-random carts.
let seed = 12345;
const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const DISCOUNTS = [
  {},
  { discountType: "SENIOR", discountPercent: 20 },
  { discountType: "PWD", discountPercent: 20 },
  { discountType: "PROMO10", discountPercent: 10, vatExempt: false },
  { discountType: "FIXED50", discountPercent: 0, fixedAmount: 50, vatExempt: false },
  { discountType: "CAP", discountPercent: 15, maxAmount: 30, vatExempt: false },
  { discountType: "EXEMPT5", discountPercent: 5, vatExempt: true },
];
function cart() {
  const n = 1 + Math.floor(rand() * 6);
  let vatableTotal = 0;
  let nonVatableTotal = 0;
  const items: { quantity: number }[] = [];
  for (let i = 0; i < n; i++) {
    const qty = 1 + Math.floor(rand() * 30);
    const price = Math.round(rand() * 50000) / 100;
    if (rand() < 0.6) vatableTotal += qty * price;
    else nonVatableTotal += qty * price;
    items.push({ quantity: qty });
  }
  const d = DISCOUNTS[Math.floor(rand() * DISCOUNTS.length)];
  const input = { vatableTotal: Number(vatableTotal.toFixed(2)), nonVatableTotal: Number(nonVatableTotal.toFixed(2)), ...d };
  const exemptSale = "discountType" in d && (d.discountType === "SENIOR" || d.discountType === "PWD" || ("vatExempt" in d && d.vatExempt === true));
  return { totals: calculateVatInclusiveTotals(input), items, exemptSale };
}
const parts = (t: { vatableSales: number; vatAmount: number; nonVatableSales: number }) => Number((t.vatableSales + t.vatAmount + t.nonVatableSales).toFixed(2));

test("everything off: exactly today's numbers, for 100,000 carts and every payment method", () => {
  for (let i = 0; i < 100_000; i++) {
    const c = cart();
    for (const paymentMethod of ["CASH", "E_WALLET"]) {
      const r = applyPricing(c.totals, { exemptSale: c.exemptSale, paymentMethod, items: c.items }, NO_PRICING);
      assert.equal(r.totals, c.totals, "the very same object: nothing touched");
      assert.equal(r.adjustmentAmount, 0);
      assert.equal(r.roundingAmount, 0);
    }
    // A rule that leaves the total as is changes nothing either.
    const same = applyPricing(c.totals, { exemptSale: false, paymentMethod: "CASH", items: c.items }, { roundingStep: null, rule: { label: "x", expr: "total" } });
    assert.deepEqual(same.totals, c.totals);
  }
});

test("cash rounding: always down, to the step, never to zero, cash only; parts still add up", () => {
  for (let i = 0; i < 30_000; i++) {
    const c = cart();
    for (const step of [0.25, 0.5, 1]) {
      const r = applyPricing(c.totals, { exemptSale: c.exemptSale, paymentMethod: "CASH", items: c.items }, { roundingStep: step, rule: null });
      const total = r.totals.finalTotal;
      assert.ok(total <= c.totals.finalTotal + 1e-9, "never more than computed");
      assert.ok(c.totals.finalTotal - total < step - 1e-9, "less than one step off");
      if (c.totals.finalTotal >= step) assert.equal(Math.round(total * 100) % Math.round(step * 100), 0, `${total} is a multiple of ${step}`);
      assert.ok(total > 0 || c.totals.finalTotal === 0);
      assert.equal(parts(r.totals), total, "VATable + VAT + non-VAT = charged");
      assert.equal(Number((r.computedTotal + r.roundingAmount).toFixed(2)), total);
      if (c.exemptSale) assert.equal(r.totals.vatAmount, 0, "SC/PWD stays VAT-free");
      const wallet = applyPricing(c.totals, { exemptSale: c.exemptSale, paymentMethod: "E_WALLET", items: c.items }, { roundingStep: step, rule: null });
      assert.equal(wallet.totals, c.totals, "e-wallet pays the exact amount");
    }
  }
  const tiny = calculateVatInclusiveTotals({ vatableTotal: 0.2, nonVatableTotal: 0 });
  assert.equal(applyPricing(tiny, { exemptSale: false, paymentMethod: "CASH", items: [] }, { roundingStep: 0.25, rule: null }).totals.finalTotal, 0.2);
});

test("example: ₱548.15 cash → ₱548.00, VAT recomputed on the VATable part", () => {
  const t = calculateVatInclusiveTotals({ vatableTotal: 448.15, nonVatableTotal: 100 });
  const r = applyPricing(t, { exemptSale: false, paymentMethod: "CASH", items: [{ quantity: 1 }] }, { roundingStep: 0.25, rule: null });
  assert.equal(r.totals.finalTotal, 548);
  assert.equal(r.roundingAmount, -0.15);
  assert.equal(parts(r.totals), 548);
  assert.ok(r.totals.vatAmount < t.vatAmount);
});

test("owner formula: applies within ±20%, never on SC/PWD, then cash rounding", () => {
  const t = calculateVatInclusiveTotals({ vatableTotal: 1000, nonVatableTotal: 0 });
  const ctx = { exemptSale: false, paymentMethod: "CASH", items: [{ quantity: 4 }] };
  const fee: PricingRules = { roundingStep: null, rule: { label: "Service fee", expr: "total * 1.03" } };
  const r = applyPricing(t, ctx, fee);
  assert.equal(r.totals.finalTotal, 1030);
  assert.deepEqual([r.adjustmentAmount, r.adjustmentLabel], [30, "Service fee"]);
  assert.equal(parts(r.totals), 1030);
  assert.equal(r.totals.vatAmount, Number((1030 * 12 / 112).toFixed(2)));

  const bulk: PricingRules = { roundingStep: 1, rule: { label: "Bulk promo", expr: "if(pieces >= 3, total - 25.5, total)" } };
  const b = applyPricing(t, ctx, bulk);
  assert.deepEqual([b.adjustmentAmount, b.roundingAmount, b.totals.finalTotal], [-25.5, -0.5, 974]);

  const sc = calculateVatInclusiveTotals({ vatableTotal: 1000, nonVatableTotal: 0, discountType: "SENIOR" });
  const s = applyPricing(sc, { ...ctx, exemptSale: true }, fee);
  assert.equal(s.totals.finalTotal, sc.finalTotal);
  assert.match(s.ruleSkipped ?? "", /SC\/PWD/);

  const tooFar = applyPricing(t, ctx, { roundingStep: null, rule: { label: "Oops", expr: "total * 10" } });
  assert.equal(tooFar.totals.finalTotal, 1000);
  assert.match(tooFar.ruleSkipped ?? "", /20%/);
  assert.equal(applyPricing(t, ctx, { roundingStep: null, rule: { label: "x", expr: "total * 1.2" } }).totals.finalTotal, 1200, "exactly 20% is allowed");
  assert.equal(applyPricing(t, ctx, { roundingStep: null, rule: { label: "x", expr: "-5" } }).totals.finalTotal, 1000, "negative ignored");
});

test("receipts: an adjusted sale shows the standard steps, then each adjustment, ending at what was charged", () => {
  for (let i = 0; i < 20_000; i++) {
    const c = cart();
    const rules: PricingRules = { roundingStep: [0.25, 0.5, 1][i % 3], rule: i % 2 ? { label: "Service fee", expr: "total * 1.05" } : null };
    const r = applyPricing(c.totals, { exemptSale: c.exemptSale, paymentMethod: "CASH", items: c.items }, rules);
    const t = r.totals;
    // The sale as saved, then as read back for a receipt.
    const data = {
      subtotal: t.subtotal, vatableSales: t.vatableSales, nonVatableSales: t.nonVatableSales, taxAmount: t.vatAmount, discountAmount: t.discountAmount,
      totalAmount: t.finalTotal, vatExemptSales: t.vatExemptSales, vatableGross: t.vatableGross, nonVatableGross: t.nonVatableGross,
      vatableDiscountAmount: t.vatableDiscountAmount, nonVatableDiscountAmount: t.nonVatableDiscountAmount, vatRemovedFromVatable: t.vatRemovedFromVatable,
      discountVatExempt: c.exemptSale, adjustmentAmount: r.adjustmentAmount, adjustmentLabel: r.adjustmentLabel, roundingAmount: r.roundingAmount,
      computedParts: r.computedParts,
      discountType: "NONE",
    } as unknown as ReceiptData;
    const lines = buildComputationLines(data);
    // The rebuilt standard steps are exactly the original computation's.
    const original = buildComputationLines({ ...data, ...{ vatableSales: c.totals.vatableSales, nonVatableSales: c.totals.nonVatableSales, taxAmount: c.totals.vatAmount, totalAmount: c.totals.finalTotal, adjustmentAmount: 0, roundingAmount: 0 } } as ReceiptData);
    const extra = [r.adjustmentAmount, r.roundingAmount].filter((x) => x !== 0).length;
    assert.deepEqual(lines.slice(0, lines.length - extra), original, `cart ${i}`);
    if (r.roundingAmount) assert.deepEqual(lines.at(-1), { label: "Rounding", amount: r.roundingAmount, kind: "subtract" });
    if (r.adjustmentAmount) assert.ok(lines.some((l) => l.label === "Service fee" && l.amount === r.adjustmentAmount));
  }
});

test("default workspaces: receipts print exactly as before, with the new fields missing or zero", () => {
  const store = { storeName: "Botika", receiptTitle: "AR", addressLine1: "Rizal Ave.", footerMessage: "Salamat!", showVatBreakdown: true, showCashierName: true, showCustomerName: true, includeOrderRemarks: true };
  for (let i = 0; i < 3_000; i++) {
    const c = cart();
    const r = applyPricing(c.totals, { exemptSale: c.exemptSale, paymentMethod: "CASH", items: c.items }, NO_PRICING);
    const t = r.totals;
    const before = {
      saleNumber: "AR-1", date: new Date("2026-11-25T02:00:00Z"), items: [{ name: "Item", quantity: 1, unitPrice: t.subtotal, totalPrice: t.subtotal, isVatable: true }],
      subtotal: t.subtotal, discountType: c.exemptSale ? "SENIOR" : "NONE", discountAmount: t.discountAmount, taxAmount: t.vatAmount,
      vatableSales: t.vatableSales, nonVatableSales: t.nonVatableSales, vatableGross: t.vatableGross, nonVatableGross: t.nonVatableGross,
      vatableDiscountAmount: t.vatableDiscountAmount, nonVatableDiscountAmount: t.nonVatableDiscountAmount, vatRemovedFromVatable: t.vatRemovedFromVatable,
      totalAmount: t.finalTotal, paymentMethod: "CASH", cashReceived: 1e6, changeGiven: 1e6 - t.finalTotal, cashier: { firstName: "A", lastName: "B" }, store,
    } as unknown as ReceiptData;
    const after = { ...before, adjustmentAmount: r.adjustmentAmount, adjustmentLabel: r.adjustmentLabel, roundingAmount: r.roundingAmount, computedParts: r.computedParts };
    assert.equal(generateThermalReceiptText(after), generateThermalReceiptText(before));
    assert.equal(generateReceiptHTML(after, { autoPrint: false }), generateReceiptHTML(before, { autoPrint: false }));
  }
});

test("formula may only use values known before payment", () => {
  assert.equal(ruleError("total * 1.02"), null);
  assert.equal(ruleError("round(subtotal - discount, 0)"), null);
  assert.match(ruleError("total - change") ?? "", /change/);
  assert.match(ruleError("cash") ?? "", /isn't known/);
  assert.match(ruleError("total +") ?? "", /ends too early/);
  assert.match(ruleError("") ?? "", /Type/);
});
