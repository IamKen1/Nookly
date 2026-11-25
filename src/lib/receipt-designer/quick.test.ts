// Run: npx tsx --test src/lib/receipt-designer/quick.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { newBlock, newField, valueLine } from "./blocks";
import { editableText, partSource, partStyle, setPartAlign, setPartSource, setPartStyle } from "./quick";
import { layoutReceipt } from "./layout";
import { sampleReceipt } from "./samples";
import type { Block, Template } from "./types";

const store = {
  storeName: "Botika", receiptTitle: "AR", addressLine1: "Rizal Ave.", footerMessage: "Salamat!",
  showVatBreakdown: true, showCashierName: true, showCustomerName: true, includeOrderRemarks: true,
};
const totals = (): Extract<Block, { type: "totals" }> => ({
  ...(newBlock("totals") as Extract<Block, { type: "totals" }>),
  lines: [valueLine("grossTotal"), { id: "h1", kind: "heading", text: "VAT", align: "left", style: {} }, valueLine("totalDue", { label: "TOTAL" })],
});

test("rows of a totals block carry their line id; other blocks don't", () => {
  const t = totals();
  const tpl: Template = { version: 1, paperWidth: 58, printMode: "TEXT", theme: { style: {} }, blocks: [t, newBlock("text")] };
  const rows = layoutReceipt(tpl, sampleReceipt("regular", store, { firstName: "A", lastName: "B" }, null));
  assert.deepEqual(rows.filter((r) => r.blockId === t.id).map((r) => r.lineId), t.lines.map((l) => l.id));
  assert.ok(rows.filter((r) => r.blockId !== t.id).every((r) => r.lineId === undefined));
});

test("editing text in place: labels of lines and values, custom text", () => {
  const t = totals();
  const total = t.lines[2];
  const e = editableText(t, total.id)!;
  assert.equal(e.value, "TOTAL");
  const next = e.apply("KABUUAN") as typeof t;
  assert.equal((next.lines[2] as { label: string }).label, "KABUUAN");
  assert.equal(next.lines[0], t.lines[0], "other lines untouched");
  assert.equal(editableText(t, "h1")!.apply("VAT SUMMARY").type, "totals");
  assert.equal(editableText(newBlock("text"), null)!.multiline, true);
  assert.equal(editableText(newBlock("rule"), null), null);
});

test("style and align go to the line when a line is picked", () => {
  const t = totals();
  const id = t.lines[2].id;
  const bolded = setPartStyle(t, id, { ...partStyle(t, id), bold: true }) as typeof t;
  assert.equal((bolded.lines[2] as { style: { bold?: boolean } }).style.bold, true);
  assert.deepEqual(bolded.style, {});
  const centered = setPartAlign(t, id, "center") as typeof t;
  assert.deepEqual([(centered.lines[2] as { align?: string }).align, (centered.lines[2] as { layout?: string }).layout], ["center", "inline"]);
  const f = setPartAlign(newField("totalDue"), null, "right") as Extract<Block, { type: "field" }>;
  assert.deepEqual([f.align, f.layout], ["right", "inline"]);
});

test("switching where a number comes from keeps the label the owner typed", () => {
  const t = totals();
  const id = t.lines[2].id; // "TOTAL" (renamed)
  const asFormula = setPartSource(t, id, { kind: "formula", expr: "subtotal - vatRemoved", format: "money" }) as typeof t;
  assert.deepEqual(partSource(asFormula, id), { kind: "formula", expr: "subtotal - vatRemoved", format: "money" });
  assert.equal((asFormula.lines[2] as { label: string }).label, "TOTAL");
  const gross = t.lines[0].id; // default label follows the new value
  const swapped = setPartSource(t, gross, { kind: "field", key: "discount" }) as typeof t;
  assert.equal((swapped.lines[0] as { label: string }).label, "Less: Discount:");
  const field = setPartSource(newField("cash", { label: "CASH", showWhen: { saleTypes: ["cash"] } }), null, { kind: "formula", expr: "cash", format: "money" });
  assert.equal(field.type, "formula");
  assert.deepEqual(field.showWhen, { saleTypes: ["cash"] });
});
