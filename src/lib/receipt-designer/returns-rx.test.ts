// Run: npx tsx --test src/lib/receipt-designer/returns-rx.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import type { ReceiptData, ReceiptStoreSettings } from "@/types/receipt";
import { generateReceiptHTML, generateThermalReceiptText } from "@/lib/receipt";
import { calculateVatInclusiveTotals } from "@/lib/vat-calculations";
import { returnParts } from "@/lib/return-parts";
import { buildPreset, PRESETS } from "./presets";
import { conditionHolds, forDesign, layoutReceipt } from "./layout";
import { toPrintedLines } from "./textmode";
import { sampleReceipt } from "./samples";
import { ITEM_FORMATS, newBlock, newField } from "./blocks";
import { buildFromAnswers, answersFor } from "./wizard";
import type { Block, Template } from "./types";

const store: ReceiptStoreSettings = {
  storeName: "Botika", receiptTitle: "AR", addressLine1: "Rizal Ave.", footerMessage: "Salamat!",
  showVatBreakdown: true, showCashierName: true, showCustomerName: true, includeOrderRemarks: true,
};
const cashier = { firstName: "Ana", lastName: "Cruz" };
const text = (t: Template, d: ReceiptData) => toPrintedLines(layoutReceipt(t, d), t.paperWidth).map((l) => (l.kind === "text" ? l.text : `[${l.kind}]`));
const design = (blocks: Block[]): Template => ({ ...buildPreset("classic", store, 58), blocks });

test("returns and voided sales say so at the top of every preset; sales don't", () => {
  for (const p of PRESETS) {
    const t = buildPreset(p.key, store, 58);
    const ret = text(t, sampleReceipt("return", store, cashier, null));
    assert.deepEqual(ret.slice(0, 2), ["RETURN / REFUND", "For AR-SAMPLE-0001"], p.key);
    const voided = text(t, sampleReceipt("voided", store, cashier, null));
    assert.equal(voided[0], "*** VOIDED ***", p.key);
    const sale = text(t, sampleReceipt("regular", store, cashier, null));
    assert.ok(!sale.some((l) => /RETURN \/ REFUND|VOIDED/.test(l)), p.key);
  }
});

test("a return's VAT split comes from the original sale and adds up to the refund", () => {
  let seed = 7;
  const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let i = 0; i < 20_000; i++) {
    const vatableTotal = Math.round(rand() * 300000) / 100;
    const nonVatableTotal = rand() < 0.5 ? Math.round(rand() * 100000) / 100 : 0;
    const discount = [{}, { discountType: "SENIOR", discountPercent: 20 }, { discountType: "PROMO", discountPercent: 10, vatExempt: false }][i % 3];
    const t = calculateVatInclusiveTotals({ vatableTotal, nonVatableTotal, ...discount });
    if (t.subtotal === 0) continue;
    const orig = {
      subtotal: t.subtotal, totalAmount: t.finalTotal, vatableSales: t.vatableSales, nonVatableSales: t.nonVatableSales,
      vatableGross: t.vatableGross, nonVatableGross: t.nonVatableGross, vatableDiscountAmount: t.vatableDiscountAmount,
      nonVatableDiscountAmount: t.nonVatableDiscountAmount, vatRemovedFromVatable: t.vatRemovedFromVatable,
      discountType: "discountType" in discount ? discount.discountType : "NONE", discountName: null, discountRate: null, discountVatExempt: false,
    };
    // As the return route works it out.
    const returned = Math.round(t.subtotal * rand() * 100) / 100;
    const ratio = returned / t.subtotal;
    const ret = { subtotal: -returned, taxAmount: -Number((t.vatAmount * ratio).toFixed(2)), totalAmount: -Number((t.finalTotal * ratio).toFixed(2)) };
    const p = returnParts(ret, orig);
    const sc = orig.discountType === "SENIOR";
    if (!sc) assert.equal(Math.round((p.vatableSales + p.nonVatableSales + ret.taxAmount) * 100), Math.round(ret.totalAmount * 100), `cart ${i}`);
    assert.ok(p.vatableSales <= 0 && p.nonVatableSales <= 0, "negative like the return's amounts");
    if (sc) assert.ok(p.vatExemptSales !== undefined && p.vatExemptSales <= 0);
  }
});

test("the standard receipt ignores the new fields (default workspaces print as before)", () => {
  for (const kind of ["return", "voided", "rx", "regular"] as const) {
    const d = sampleReceipt(kind, store, cashier, null);
    const plain: ReceiptData = { ...d, receiptKind: undefined, originalSaleNumber: undefined, returnParts: undefined, prescription: undefined, items: d.items.map(({ dosage, batches, ...i }) => (void dosage, void batches, i)) };
    assert.equal(generateThermalReceiptText(d), generateThermalReceiptText(plain), kind);
    assert.equal(generateReceiptHTML(d, { autoPrint: false }), generateReceiptHTML(plain, { autoPrint: false }), kind);
  }
});

test("Show only when: sale, return, voided, prescription", () => {
  const sale = sampleReceipt("regular", store, cashier, null);
  const ret = sampleReceipt("return", store, cashier, null);
  const voided = sampleReceipt("voided", store, cashier, null);
  const rx = sampleReceipt("rx", store, cashier, null);
  const holds = (t: "sale" | "return" | "voided" | "prescription", d: ReceiptData) => conditionHolds({ saleTypes: [t] }, d);
  assert.deepEqual([holds("sale", sale), holds("sale", ret), holds("sale", voided)], [true, false, false]);
  assert.deepEqual([holds("return", ret), holds("return", sale)], [true, false]);
  assert.deepEqual([holds("voided", voided), holds("voided", ret)], [true, false]);
  assert.deepEqual([holds("prescription", rx), holds("prescription", sale)], [true, false]);
  // The register preset's "AMOUNT TENDERED" no longer dangles on a return.
  assert.ok(!text(buildPreset("register", store, 58), ret).includes("AMOUNT TENDERED"));
  assert.ok(text(buildPreset("register", store, 58), sale).includes("AMOUNT TENDERED"));
  assert.equal(forDesign(sale), sale, "a sale passes through untouched");
});

test("Rx no., doctor, directions, lot and expiry print; items without them skip the line", () => {
  const rx = sampleReceipt("rx", store, cashier, null);
  const items = { ...newBlock("items"), itemFormat: ITEM_FORMATS.find((f) => f.key === "pharmacy")!.make(), showItemCount: false } as Block;
  const t = design([
    newField("rxNumber", { layout: "inline" }),
    newField("doctor", { layout: "inline" }),
    newField("doctorLicense", { layout: "inline" }),
    items,
  ]);
  const out = text(t, rx).join("\n");
  assert.match(out, /Rx No: RX-2026-00042/);
  assert.match(out, /Doctor: Maria Santos, MD/);
  assert.match(out, /PRC No: 0123456/);
  assert.match(out, /Lot +LS0921 exp 12\/15\/2026; LS1003 exp\s+6\/30\/2027/);
  assert.match(out, /Sig: +1 tablet once a day/);
  // Vitamin C has no batches and no directions: neither line prints for it.
  const lines = text(t, rx);
  const vitC = lines.findIndex((l) => l.startsWith("Ascorbic"));
  assert.ok(lines.slice(vitC + 2).every((l) => !/^(Lot|Sig:)/.test(l)), lines.slice(vitC).join("\n"));
  // A sale without a prescription: the Rx lines are simply absent.
  const plain = text(t, sampleReceipt("regular", store, cashier, null)).join("\n");
  assert.doesNotMatch(plain, /Rx No|Doctor|PRC|Sig:/);
  // The wizard's pharmacy item style builds and prints the same lines.
  const w = buildFromAnswers({ ...answersFor("classic", 58), items: "pharmacy" }, store);
  assert.match(text(w, rx).join("\n"), /LS0921 exp/);
});
