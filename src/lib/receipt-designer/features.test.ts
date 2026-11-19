// Run: npx tsx --test src/lib/receipt-designer/features.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import type { ReceiptData, ReceiptStoreSettings } from "@/types/receipt";
import { parseFormula, evaluateFormula, formulaError, computeFormula, formatFormula, FormulaError } from "./formula";
import { conditionHolds, layoutReceipt } from "./layout";
import { columnWidths, toPrintedLines, columnsFor } from "./textmode";
import { ITEM_FORMATS, breakApart, bothConditions, newBlock, newField, newItemCell, newRowCell, valueLine } from "./blocks";
import { sanitizeTemplate, designWarnings } from "./validate";
import { peso } from "@/lib/receipt";
import type { Block, Template } from "./types";

const store: ReceiptStoreSettings = {
  storeName: "Botika", receiptTitle: "AR", addressLine1: "Rizal Ave.", footerMessage: "Salamat!",
  showVatBreakdown: true, showCashierName: true, showCustomerName: true, includeOrderRemarks: true,
};
const sale = (over: Partial<ReceiptData> = {}): ReceiptData => ({
  saleNumber: "AR-1",
  date: new Date("2026-11-19T10:00:00+08:00"),
  storeId: "store-main",
  items: [
    { name: "Biogesic 500mg Tablet", genericName: "Paracetamol", quantity: 2, unitPrice: 6.5, totalPrice: 13, isVatable: true },
    { name: "Alaxan FR Capsule", quantity: 2, unitPrice: 9, totalPrice: 18, isVatable: false },
  ],
  subtotal: 31, discountType: "NONE", discountAmount: 0, taxAmount: 1.39, vatableSales: 11.61, nonVatableSales: 18,
  vatableGross: 13, nonVatableGross: 18, vatRemovedFromVatable: 0, zeroRatedSales: 0,
  totalAmount: 31, paymentMethod: "CASH", cashReceived: 50, changeGiven: 19,
  cashier: { firstName: "Ana", lastName: "Reyes" }, store,
  ...over,
});
const sc = sale({ discountType: "SENIOR", discountName: "Senior Citizen", discountRate: "20%", discountAmount: 5.92, vatRemovedFromVatable: 1.39, totalAmount: 23.69, vatExemptSales: 11.61 });
const t = (blocks: Block[], paperWidth: 58 | 80 = 58): Template => ({ version: 1, paperWidth, printMode: "TEXT", theme: { style: {} }, blocks });
const printed = (tpl: Template, data = sale()) =>
  toPrintedLines(layoutReceipt(tpl, data), tpl.paperWidth)
    .filter((l): l is Extract<typeof l, { kind: "text" }> => l.kind === "text")
    .map((l) => l.text)
    .filter((l) => l.trim() && !/BIR-accred|ited Official|voice\./.test(l));

// ---------- formulas ----------

test("formula: arithmetic, precedence, functions", () => {
  const d = sale();
  const ev = (s: string, data = d) => evaluateFormula(parseFormula(s), data);
  assert.equal(ev("1 + 2 * 3"), 7);
  assert.equal(ev("(1 + 2) * 3"), 9);
  assert.equal(ev("10 - 4 - 3"), 3);
  assert.equal(ev("2 × 3 ÷ 4"), 1.5);
  assert.equal(ev("-subtotal + 1"), -30);
  assert.equal(ev("round(total / 1.12, 2)"), 27.68);
  assert.equal(ev("round(2.675, 2)"), 2.68, "rounds half up despite float");
  assert.equal(ev("floor(pieces / 3)"), 1);
  assert.equal(ev("ceil(9.01)"), 10);
  assert.equal(ev("abs(-5)"), 5);
  assert.equal(ev("max(subtotal, 100, 7)"), 100);
  assert.equal(ev("min(subtotal, 100)"), 31);
  assert.equal(ev("10 % 3"), 1);
  assert.equal(ev("pieces"), 4);
  assert.equal(ev("products"), 2);
  assert.equal(ev("if(total >= 500, 50, 0)"), 0);
  assert.equal(ev("if(total >= 30 and pieces > 3, 1, 2)"), 1);
  assert.equal(ev("if(total > 100 or not (pieces == 4), 1, 2)"), 2);
  assert.equal(ev("round(savings / subtotal * 100, 0)", sc), 24);
});

test("formula: values that don't apply, and division by zero, give no line", () => {
  assert.equal(computeFormula("pointsBalance * 1", sale()), null, "no loyalty on this sale");
  assert.equal(computeFormula("total / 0", sale()), null);
  assert.equal(computeFormula("total / discount", sale()), null, "discount is 0");
  assert.equal(computeFormula("if(total > 1, 5, pointsBalance)", sale()), 5, "the branch not taken doesn't matter");
});

test("formula: errors are clear and nothing but math runs", () => {
  for (const [src, msg] of [
    ["", /Type a formula/],
    ["total +", /ends too early/],
    ["(total", /Missing "\)"/],
    ["totl * 2", /Unknown value "totl"/],
    ["eval(1)", /Unknown function "eval"/],
    ["round()", /takes 1–2/],
    ["total 2", /Unexpected "2"/],
    ["total; process.exit()", /Can't read/],
    ["constructor", /Unknown value/],
    ["x".repeat(301), /at most 300/],
  ] as const) {
    assert.throws(() => parseFormula(src), (e: unknown) => e instanceof FormulaError && msg.test((e as Error).message), src);
  }
  assert.equal(formulaError("total / 1.12"), null);
  assert.throws(() => parseFormula("(".repeat(60) + "1" + ")".repeat(60)), /nested too deeply/);
});

test("formula: output formats", () => {
  assert.equal(formatFormula(27.678, "money", 2, peso), "₱27.68");
  assert.equal(formatFormula(1234.5, "number", 1, peso), "1,234.5");
  assert.equal(formatFormula(18.25, "percent", 0, peso), "18%");
  assert.equal(formatFormula(4.6, "int", 0, peso), "5");
});

test("formula elements print, hide when not applicable, and work in groups and rows", () => {
  const f = { ...newBlock("formula"), label: "Natipid mo:", expr: "round(savings / subtotal * 100, 0)", format: "percent", decimals: 0, hideWhenZero: true } as Block;
  assert.deepEqual(printed(t([f]), sc), [`Natipid mo:${" ".repeat(32 - 11 - 3)}24%`]);
  assert.deepEqual(printed(t([f]), sale()), [], "0% hidden");

  const totals = newBlock("totals") as Extract<Block, { type: "totals" }>;
  totals.lines = [valueLine("totalDue", { label: "TOTAL:" }), { id: "f", kind: "formula", label: "VAT-ex:", expr: "total / 1.12", format: "money", decimals: 2, style: {}, minus: false, hideWhenZero: false }];
  assert.ok(printed(t([totals])).some((l) => l.startsWith("VAT-ex:") && l.endsWith("₱27.68")));

  const row = { ...newBlock("row"), cells: [newRowCell({ kind: "formula", expr: "pieces", format: "int", label: "Pcs:" }), newRowCell({ kind: "field", key: "totalDue", align: "right" })] } as Block;
  assert.deepEqual(printed(t([row])), [`Pcs: 4${" ".repeat(32 - 6 - 1 - 6)} ₱31.00`]);
});

// ---------- rows / columns ----------

test("column widths add up exactly", () => {
  assert.deepEqual(columnWidths([{ width: 0 }, { width: 0 }], 32, 1), [15, 16]);
  assert.deepEqual(columnWidths([{ width: 50 }, { width: 0 }], 32, 1), [15, 16]);
  assert.deepEqual(columnWidths([{ width: 25 }, { width: 25 }], 32, 0), [8, 24]);
  assert.deepEqual(columnWidths([{ width: 80 }, { width: 80 }], 32, 0), [16, 16], "over 100% scales down");
  assert.deepEqual(columnWidths([{ width: 0 }, { width: 0 }, { width: 0 }], 48, 1), [15, 15, 16]);
  for (const cells of [[{ width: 10 }, { width: 0 }, { width: 33 }], [{ width: 0 }], [{ width: 100 }, { width: 0 }]]) {
    const w = columnWidths(cells, 32, 1);
    assert.equal(w.reduce((a, b) => a + b, 0) + (cells.length - 1), 32, JSON.stringify(cells));
  }
});

test("a row puts values side by side, aligned in their columns, wrapping inside them", () => {
  const row = { ...newBlock("row"), cells: [newRowCell({ key: "date", label: "Date:" }), newRowCell({ key: "time", align: "right" })] } as Block;
  const [line] = printed(t([row]));
  assert.equal(line.length, 32);
  assert.ok(line.startsWith("Date: 11/19/2026") && line.endsWith("10:00 AM"), line);

  const three = { ...newBlock("row"), gap: 1, cells: [newRowCell({ kind: "text", text: "A long text that wraps", width: 50 }), newRowCell({ kind: "text", text: "mid", align: "center" }), newRowCell({ kind: "text", text: "R", align: "right" })] } as Block;
  const lines = printed(t([three]));
  // 50% = 15 columns, wrapped at a space; "mid" and "R" get what they need plus the spare.
  assert.deepEqual(lines, ["A long text       mid          R", "that wraps"]);

  const empty = { ...newBlock("row"), cells: [newRowCell({ key: "customer" }), newRowCell({ key: "pointsBalance" })] } as Block;
  assert.deepEqual(printed(t([empty])), [], "a row whose values all don't apply prints nothing");
});

// ---------- item lines ----------

test("item formats: one line, table with header, and generic-name lines skipped when empty", () => {
  const items = (key: string) => ({ ...newBlock("items"), itemFormat: ITEM_FORMATS.find((f) => f.key === key)!.make(), showItemCount: false }) as Block;
  const one = printed(t([{ ...items("oneLine"), header: false } as Block]));
  assert.deepEqual(one, ["2 Biogesic 500mg Tablet   ₱13.00", "2 Alaxan FR Capsule       ₱18.00"], "columns line up from item to item");

  // 80mm: everything fits; header and every item share the same column widths.
  const table = printed(t([items("table")], 80));
  assert.ok(/^ITEM\s+QTY\s+PRICE\s+AMOUNT$/.test(table[0]), table[0]);
  assert.ok(/^Biogesic 500mg Tablet\s+2\s+₱6\.50\s+₱13\.00$/.test(table[2]), table[2]);
  assert.ok(/^Alaxan FR Capsule\s+2\s+₱9\.00\s+₱18\.00$/.test(table[3]), table[3]);
  const end = (l: string, s: string) => l.indexOf(s) + s.length;
  assert.equal(end(table[2], " 2 "), end(table[0], "QTY") + 1, "quantities right under QTY");
  assert.equal(end(table[2], "₱13.00"), end(table[0], "AMOUNT"), "amounts right under AMOUNT");
  assert.equal(end(table[3], "₱18.00"), end(table[0], "AMOUNT"));

  // 58mm: too narrow for everything, so only the name column gives way; QTY, prices stay whole.
  const narrow = printed(t([items("table")]));
  assert.ok(/^ITEM\s+QTY\s+PRICE\s+AMOUNT$/.test(narrow[0]), narrow[0]);
  assert.ok(/^Biogesic 500mg\s+2\s+₱6\.50\s+₱13\.00$/.test(narrow[2]), narrow[2]);
  assert.equal(narrow[3], "Tablet");
  assert.ok(narrow.every((l) => l.length <= 32));

  const withGeneric = { ...newBlock("items"), header: false, showItemCount: false, itemFormat: { lines: [{ id: "a", style: {}, cells: [newItemCell("name")] }, { id: "b", style: {}, cells: [newItemCell("generic")] }] } } as Block;
  assert.deepEqual(printed(t([withGeneric])), ["Biogesic 500mg Tablet", "Paracetamol", "Alaxan FR Capsule"]);
});

test("the standard two-line item layout is unchanged when no format is set", () => {
  const plain = { ...newBlock("items"), header: false, showItemCount: false } as Block;
  assert.deepEqual(printed(t([plain])), ["Biogesic 500mg Tablet", `2 x ₱6.50${" ".repeat(32 - 9 - 8)}₱13.00 V`, "Alaxan FR Capsule", `2 x ₱9.00${" ".repeat(32 - 9 - 8)}₱18.00 N`]);
});

// ---------- conditions ----------

test("show only when: sale types, totals, dates, branches", () => {
  const ok = (c: Parameters<typeof conditionHolds>[0], d = sale()) => conditionHolds(c, d);
  assert.equal(ok(undefined), true);
  assert.equal(ok({ saleTypes: ["scpwd"] }), false);
  assert.equal(ok({ saleTypes: ["scpwd"] }, sc), true);
  assert.equal(ok({ saleTypes: ["discount", "cash"] }, sc), true);
  assert.equal(ok({ saleTypes: ["noDiscount"] }, sc), false);
  assert.equal(ok({ saleTypes: ["ewallet"] }), false);
  assert.equal(ok({ saleTypes: ["customer"] }), false);
  assert.equal(ok({ saleTypes: ["points"] }, sale({ loyalty: { pointsRedeemed: 0, pointsAmount: 0, pointsEarned: 1, balanceAfter: 5 } })), true);
  assert.equal(ok({ minTotal: 31 }), true);
  assert.equal(ok({ minTotal: 31.01 }), false);
  assert.equal(ok({ maxTotal: 30 }), false);
  assert.equal(ok({ fromDate: "2026-11-19", toDate: "2026-11-19" }), true, "same Philippine day");
  assert.equal(ok({ toDate: "2026-11-18" }), false);
  assert.equal(ok({ fromDate: "2026-11-20" }), false);
  // 11pm UTC on the 18th is already the 19th in Manila
  assert.equal(ok({ fromDate: "2026-11-19" }, sale({ date: new Date("2026-11-18T23:00:00Z") })), true);
  assert.equal(ok({ branches: ["store-main"] }), true);
  assert.equal(ok({ branches: ["store-2"] }), false);
  assert.equal(ok({ branches: ["store-2"] }, sale({ storeId: null })), false);
});

test("conditions on elements and on lines inside a group", () => {
  const promo = { ...newBlock("text"), text: "PROMO", showWhen: { minTotal: 500 } } as Block;
  assert.deepEqual(printed(t([promo])), []);
  assert.deepEqual(printed(t([promo]), sale({ totalAmount: 600 })), ["PROMO"]); // centered by the printer

  const totals = newBlock("totals") as Extract<Block, { type: "totals" }>;
  totals.lines = [valueLine("totalDue", { label: "TOTAL:" }), { ...valueLine("discount", { label: "SC discount:" }), showWhen: { saleTypes: ["scpwd"] } }];
  assert.equal(printed(t([totals])).length, 1);
  assert.equal(printed(t([totals]), sc).length, 2);
});

test("a hidden-by-condition footer still prints the BIR notice", () => {
  const footer = { ...newBlock("footer"), showWhen: { saleTypes: ["ewallet"] } } as Block;
  const all = toPrintedLines(layoutReceipt(t([footer]), sale()), 58).map((l) => (l.kind === "text" ? l.text : "")).join("");
  assert.ok(all.replace(/\s/g, "").includes("BIR-accredited"));
});

test("breaking a group apart keeps its condition, combined with each line's", () => {
  const totals = { ...newBlock("totals"), showWhen: { saleTypes: ["cash"] as const } } as Extract<Block, { type: "totals" }>;
  totals.lines = [valueLine("totalDue"), { ...valueLine("discount"), showWhen: { saleTypes: ["scpwd"], minTotal: 10 } }];
  const parts = breakApart(totals as Block, (() => { let n = 0; return () => `p${n++}`; })());
  assert.deepEqual(parts[0].showWhen, { saleTypes: ["cash"] });
  assert.deepEqual(parts[1].showWhen?.saleTypes?.sort(), ["cash", "scpwd"]);
  assert.equal(parts[1].showWhen?.minTotal, 10);
  assert.deepEqual(bothConditions({ maxTotal: 100, branches: ["a", "b"] }, { maxTotal: 50, branches: ["b", "c"] }), {
    saleTypes: [], minTotal: null, maxTotal: 50, fromDate: null, toDate: null, branches: ["b"],
  });
});

// ---------- calibration ----------

test("printer calibration: a printer that fits 30 characters", () => {
  assert.equal(columnsFor(58, "A", 1, { A: 30 }), 30);
  assert.equal(columnsFor(58, "B", 1, { A: 30 }), 42, "only the font that was calibrated changes");
  assert.equal(columnsFor(58, "A", 2, { A: 30 }), 15);
  const rule = newBlock("rule");
  const lines = toPrintedLines(layoutReceipt(t([rule]), sale()), 58, { A: 30 });
  assert.equal((lines[0] as { text: string }).text, "-".repeat(30));
});

// ---------- validation ----------

test("validation: rows, formulas, item formats and conditions", () => {
  const { template, errors } = sanitizeTemplate({
    blocks: [
      { type: "row", gap: 9, cells: [{ kind: "formula", expr: "total*2", width: 500, align: "up" }, { kind: "field", key: "nope" }, {}, {}, {}, {}] },
      { type: "formula", label: "x", expr: "total +" },
      { type: "items", itemFormat: { lines: [{ cells: [{ field: "name", width: 60 }, { field: "hack" }] }, { cells: [] }] } },
      { type: "text", text: "t", showWhen: { saleTypes: ["scpwd", "bogus"], minTotal: -5, fromDate: "2026-13-99x", branches: ["s1", 5] } },
    ],
  });
  const [row, formula, items, text] = template.blocks;
  assert.ok(row.type === "row" && row.cells.length === 4 && row.gap === 4);
  assert.equal(row.cells[0].width, 100);
  assert.equal(row.cells[0].align, "left");
  assert.equal(row.cells[1].key, "date", "unknown key falls back");
  assert.ok(formula.type === "formula");
  assert.equal(errors.length, 1, "the broken formula blocks publishing");
  assert.match(errors[0], /ends too early/);
  assert.ok(items.type === "items" && items.itemFormat?.lines.length === 1 && items.itemFormat.lines[0].cells.length === 1);
  assert.deepEqual(text.showWhen, { saleTypes: ["scpwd"], minTotal: 0, branches: ["s1"] });
  const official = sanitizeTemplate({ blocks: [{ type: "row", cells: [{ kind: "text", text: "Official Receipt" }] }] });
  assert.equal(official.errors.length, 1);
});

test("names inherited by every object (constructor, toString…) are never accepted as values", () => {
  for (const name of ["constructor", "toString", "__proto__", "hasOwnProperty"]) {
    assert.throws(() => parseFormula(`${name} * 2`), FormulaError, name);
    assert.throws(() => parseFormula(`${name}(1)`), FormulaError, `${name}()`);
    const { template } = sanitizeTemplate({
      theme: { style: { fontFamily: name } },
      blocks: [{ type: "field", key: name }, { type: "totals", lines: [{ kind: "value", key: name }] }, { type: "row", cells: [{ kind: "field", key: name }] }],
    });
    assert.equal(template.theme.style.fontFamily, undefined);
    assert.equal(template.blocks.length, 2, "field dropped");
    const [totals, row] = template.blocks;
    assert.ok(totals.type === "totals" && totals.lines.length === 0);
    assert.ok(row.type === "row" && row.cells[0].key === "date");
  }
});

test("warning when a formula looks like the total", () => {
  const f = (expr: string, label = "TOTAL:") => ({ ...newBlock("formula"), label, expr }) as Block;
  const base = [newField("receiptNo"), newField("totalDue"), newField("discount"), newField("vatExemptSales"), newBlock("scPwd")];
  assert.match(designWarnings(t([...base, f("total * 0.9")])).join(), /looks like a total/);
  assert.match(designWarnings(t([...base, f("subtotal", "Halagang babayaran")])).join(), /looks like a total/);
  assert.deepEqual(designWarnings(t([...base, f("total")])), []);
  assert.deepEqual(designWarnings(t([...base, f("total / 1.12", "VAT-exclusive:")])), []);
});
