// Run: npx tsx --test src/lib/receipt-designer/register.test.ts
// Value formats, {tokens}, ALL CAPS, item barcode / "@" / VAT letters, store
// labels, the invoice block, and the "POS register" preset, checked against a
// real big-chain register receipt (SC sale of two VAT-exempt medicines).
import { test } from "node:test";
import assert from "node:assert/strict";
import type { ReceiptData, ReceiptStoreSettings } from "@/types/receipt";
import { calculateVatInclusiveTotals } from "@/lib/vat-calculations";
import { layoutReceipt } from "./layout";
import { toPrintedLines } from "./textmode";
import { newBlock, newField, newItemCell } from "./blocks";
import { buildPreset } from "./presets";
import { designWarnings, sanitizeTemplate } from "./validate";
import { formatDate, formatName, formatTime } from "./format";
import { fillLabel } from "./totals";
import type { Block, Template, ValueFormat } from "./types";

const store: ReceiptStoreSettings = {
  storeName: "Botika ng Bayan",
  receiptTitle: "",
  addressLine1: "Malhacan Meycauayan",
  addressLine2: "Bulacan",
  contactNumber: "(044) 815-1340",
  tin: "000-388-474-00190",
  footerMessage: "Maraming Salamat Po...",
  showVatBreakdown: true,
  showCashierName: true,
  showCustomerName: true,
  includeOrderRemarks: false,
};

// 10:57 AM in the Philippines.
const WHEN = new Date("2026-11-22T02:57:00Z");

function sale(items: ReceiptData["items"], sc: boolean): ReceiptData {
  const vatableTotal = items.filter((i) => i.isVatable).reduce((s, i) => s + i.totalPrice, 0);
  const nonVatableTotal = items.filter((i) => !i.isVatable).reduce((s, i) => s + i.totalPrice, 0);
  const t = calculateVatInclusiveTotals({ vatableTotal, nonVatableTotal, ...(sc ? { discountType: "SENIOR", discountPercent: 20 } : {}) });
  return {
    saleNumber: "AR-000192",
    date: WHEN,
    items,
    subtotal: t.subtotal,
    discountType: sc ? "SENIOR" : "NONE",
    discountName: sc ? "Sales Discount" : null,
    discountRate: sc ? "20%" : null,
    discountVatExempt: sc,
    discountAmount: t.discountAmount,
    discountHolderName: sc ? "Igaya, Josefina M." : undefined,
    discountIdNumber: sc ? "3318" : undefined,
    taxAmount: t.vatAmount,
    vatableSales: t.vatableSales,
    nonVatableSales: t.nonVatableSales,
    zeroRatedSales: 0,
    vatableGross: t.vatableGross,
    nonVatableGross: t.nonVatableGross,
    vatRemovedFromVatable: t.vatRemovedFromVatable,
    ...(sc ? { vatExemptSales: Math.round((t.vatableGross - t.vatRemovedFromVatable) * 100) / 100 } : {}),
    totalAmount: t.finalTotal,
    paymentMethod: "CASH",
    cashReceived: 1000,
    changeGiven: Math.round((1000 - t.finalTotal) * 100) / 100,
    cashier: { firstName: "Becca", lastName: "Santos" },
    store,
  };
}

const MEDS: ReceiptData["items"] = [
  { name: "DIAM MR TAB 60MG", barcode: "480030659101", quantity: 10, unitPrice: 31.25, totalPrice: 312.5, isVatable: false },
  { name: "GALVUS MET50/850", barcode: "480031901522", quantity: 10, unitPrice: 37.25, totalPrice: 372.5, isVatable: false },
];
const BIOGESIC = { name: "BIOGESIC 500MG TAB", barcode: null, quantity: 2, unitPrice: 6.5, totalPrice: 13, isVatable: true };

const tpl = (blocks: Block[], format?: Partial<ValueFormat>, paperWidth: 58 | 80 = 80): Template => ({
  version: 1,
  paperWidth,
  printMode: "TEXT",
  theme: { style: {}, ...(format ? { format: { currency: "peso", date: "default", time: "default", cashierName: "full", customerName: "full", ...format } } : {}) },
  blocks,
});
const lines = (t: Template, d: ReceiptData) =>
  toPrintedLines(layoutReceipt(t, d), t.paperWidth)
    .filter((l): l is Extract<typeof l, { kind: "text" }> => l.kind === "text")
    .map((l) => l.text.trimEnd())
    .filter((l) => l.trim() && !/BIR-accred|ceipt \/ Sales/.test(l)); // the notice always prints
// The amount on the line whose label is exactly `label`.
const value = (ls: string[], label: string) => {
  const l = ls.find((x) => x.startsWith(label) && /^ +[\d,.]+$/.test(x.slice(label.length)));
  assert.ok(l, `no line "${label}" in:\n${ls.join("\n")}`);
  return l.slice(label.length).trim();
};

test("formats: date, time and names in Philippine time", () => {
  assert.equal(formatDate(WHEN, "MM-DD-YY"), "11-22-26");
  assert.equal(formatDate(WHEN, "YYYY-MM-DD"), "2026-11-22");
  assert.equal(formatDate(WHEN, "MMM D, YYYY"), "Nov 22, 2026");
  assert.equal(formatTime(WHEN, "h:mmA"), "10:57A");
  assert.equal(formatTime(new Date("2026-11-22T13:05:30Z"), "h:mmA"), "9:05P");
  assert.equal(formatTime(new Date("2026-11-22T13:05:30Z"), "HH:mm:ss"), "21:05:30");
  assert.equal(formatTime(new Date("2026-11-21T16:30:00Z"), "hh:mm AM"), "12:30 AM");
  const p = { firstName: "Juan", lastName: "dela Cruz" };
  assert.equal(formatName(p, "first"), "Juan");
  assert.equal(formatName(p, "firstLastInitial"), "Juan d.");
  assert.equal(formatName(p, "lastFirst"), "dela Cruz, Juan");
});

test("tokens: any value or store detail inside text; unknown braces stay", () => {
  const d = sale(MEDS, true);
  const f: ValueFormat = { currency: "none", date: "MM-DD-YY", time: "h:mmA", cashierName: "first", customerName: "full" };
  assert.equal(fillLabel("** {quantity} item(s) **", d, f), "** 20 item(s) **");
  assert.equal(fillLabel("TXN#{receiptNo} {date} {time} {cashier}", d, f), "TXN#AR-000192 11-22-26 10:57A Becca");
  assert.equal(fillLabel("TIN:{tin}", d, f), "TIN:000-388-474-00190");
  assert.equal(fillLabel("Due {totalDue}", d, f), "Due 548.00");
  assert.equal(fillLabel("Due {totalDue}", d), "Due ₱548.00");
  assert.equal(fillLabel("{notAToken} {customer}", d), "{notAToken} ", "unknown stays; a value that doesn't apply is empty");
});

test("items: barcode, qty @ price, amount with VAT letter, own letters per sale", () => {
  const items = {
    ...(newBlock("items") as Extract<Block, { type: "items" }>),
    header: false,
    showItemCount: false,
    vatCodes: { vatable: "T", exempt: "X", nonVat: "N" },
    itemFormat: {
      lines: [
        { id: "l1", style: {}, cells: [newItemCell("name"), newItemCell("totalVat")] },
        { id: "l2", style: {}, cells: [newItemCell("text", { width: 8 }), newItemCell("barcode", { width: 44 }), newItemCell("qtyAtPrice", { align: "left" })] },
      ],
    },
  } as Block;
  const regular = lines(tpl([items], { currency: "none" }), sale([MEDS[0], BIOGESIC], false));
  assert.match(regular[0], /^DIAM MR TAB 60MG +312\.50N$/);
  assert.match(regular[1], /^ +480030659101 +10 @ 31\.25$/);
  assert.match(regular[2], /^BIOGESIC 500MG TAB +13\.00T$/);
  assert.match(regular[3], /^ +2 @ 6\.50$/, "no barcode: the line still prints qty @ price");
  const sc = lines(tpl([items], { currency: "none" }), sale([MEDS[0], BIOGESIC], true));
  assert.match(sc[2], /13\.00X$/, "VATable item on an SC sale gets the exempt letter");
  // Older designs: V/N as before, ₱ by default.
  const legacy = lines(tpl([newBlock("items")]), sale([BIOGESIC], true));
  assert.ok(legacy.some((l) => /₱13\.00 V$/.test(l)), legacy.join("\n"));
});

test("no ₱ sign anywhere when the design turns it off", () => {
  const all: Block[] = [newBlock("items"), newBlock("totals"), newBlock("payment"), newField("change")];
  const out = lines(tpl(all, { currency: "none" }), sale(MEDS, true)).join("\n");
  assert.ok(!out.includes("₱"), out);
  assert.ok(lines(tpl(all), sale(MEDS, true)).join("\n").includes("₱548.00"));
});

test("ALL CAPS on any element, and store labels exactly as typed", () => {
  const b = newField("discountHolder", { label: "SOLD TO:", layout: "inline", style: { uppercase: true } });
  assert.deepEqual(lines(tpl([b]), sale(MEDS, true)), ["SOLD TO: IGAYA, JOSEFINA M."]);
  const info = { ...(newBlock("storeInfo") as Extract<Block, { type: "storeInfo" }>), labels: { contact: "TEL NO : ", tin: "VAT REG TIN:", permit: "", accreditation: "", serial: "" } };
  const out = lines(tpl([info]), sale(MEDS, false));
  assert.ok(out.some((l) => l.trim() === "TEL NO : (044) 815-1340"), out.join("\n"));
  assert.ok(out.some((l) => l.trim() === "VAT REG TIN:000-388-474-00190"), out.join("\n"));
  // A design saved before labels existed keeps today's wording.
  const old = sanitizeTemplate({ blocks: [{ type: "storeInfo" }] }).template;
  assert.ok(lines(old, sale(MEDS, false)).some((l) => l.trim() === "TIN: 000-388-474-00190"));
});

test("validation: any 'invoice' is refused; formats and new fields survive a save", () => {
  for (const text of ["INVOICE#{receiptNo}", "- THIS IS YOUR INVOICE -", "Sales Invoice"]) {
    assert.equal(sanitizeTemplate({ blocks: [{ type: "text", text }] }).errors.length, 1, text);
  }
  assert.equal(sanitizeTemplate({ blocks: [{ type: "storeInfo", labels: { tin: "INVOICE TIN:" } }] }).errors.length, 1);
  const saved = sanitizeTemplate(buildPreset("register", store, 80));
  assert.deepEqual(saved.errors, []);
  assert.deepEqual(saved.template.theme.format, { currency: "none", date: "MM-DD-YY", time: "h:mmA", cashierName: "first", customerName: "full" });
  const bad = sanitizeTemplate({ theme: { style: { uppercase: "yes" }, format: { currency: "usd", date: "DD.MM" } } }).template.theme;
  assert.deepEqual(bad.style, {});
  assert.equal(bad.format?.currency, "peso");
  assert.equal(bad.format?.date, "default");
});

test("POS register preset: same figures as the real receipt (SC sale, VAT-exempt meds)", () => {
  const { template } = sanitizeTemplate(buildPreset("register", store, 80));
  assert.deepEqual(designWarnings(template), []);
  const out = lines(template, sale(MEDS, true));
  const text = out.join("\n");
  assert.match(text, /DIAM MR TAB 60MG +312\.50X/);
  assert.match(text, /480030659101 +10 @ 31\.25/);
  assert.equal(value(out, "Amt of VAT EXEMPT ITEMS"), "685.00");
  assert.equal(value(out, "Amt of Sale With VAT"), "0.00");
  assert.equal(value(out, "Less 12% VAT"), "0.00");
  assert.equal(value(out, "TOTAL AMOUNT w/o VAT"), "685.00");
  assert.equal(value(out, "LESS : 20% Sales Discount"), "137.00");
  assert.equal(value(out, "TOTAL AMOUNT"), "548.00");
  assert.equal(value(out, "TOTAL PAYMENT"), "1000.00");
  assert.equal(value(out, "CHANGE"), "452.00");
  assert.ok(out.includes("**   20 item(s)   **"));
  assert.ok(out.includes("SOLD TO: IGAYA, JOSEFINA M."));
  assert.match(text, /VAT-Exempt Sale +\(X\) +685\.00/);
  assert.match(text, /VATable +\(T\) +0\.00/);
  assert.match(text, /Amount Due +548\.00/);
  assert.ok(out.includes("11-22-26 10:57A BECCA"));
  assert.ok(!text.includes("₱"));
  // A regular sale: no SC lines, VAT summary splits VATable and exempt.
  const reg = lines(template, sale([MEDS[0], BIOGESIC], false));
  assert.ok(!reg.some((l) => l.startsWith("Less 12% VAT") || l.startsWith("SOLD TO") || l.startsWith("SIGNATURE")));
  assert.match(reg.join("\n"), /VATable +\(T\) +11\.61/);
  assert.equal(value(reg, "TOTAL AMOUNT"), "325.50");
});
