// Run: npx tsx --test src/lib/receipt-designer/designer.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import type { ReceiptData, ReceiptStoreSettings } from "@/types/receipt";
import { generateThermalReceiptText } from "@/lib/receipt";
import { buildPreset } from "./presets";
import { layoutReceipt } from "./layout";
import { toPrintedLines, columnsFor } from "./textmode";
import { sanitizeTemplate, designWarnings } from "./validate";
import { resolveStyle } from "./style";
import { newBlock, valueLine } from "./blocks";
import type { Template } from "./types";

// ---------- sample sales ----------

const store = (over: Partial<ReceiptStoreSettings> = {}): ReceiptStoreSettings => ({
  storeName: "Botika ng Bayan",
  receiptTitle: "Acknowledgement Receipt (AR)",
  addressLine1: "123 Rizal Ave., Brgy. San Roque",
  addressLine2: "Quezon City",
  contactNumber: "0917 123 4567",
  tin: "123-456-789-000",
  permitNumber: null,
  accreditationNumber: null,
  serialNumberLabel: null,
  footerMessage: "Thank you for your purchase!",
  showVatBreakdown: true,
  showCashierName: true,
  showCustomerName: true,
  includeOrderRemarks: true,
  ...over,
});

const sale = (over: Partial<ReceiptData> = {}): ReceiptData => ({
  saleNumber: "AR-20261118-0007",
  date: new Date("2026-11-18T09:41:00+08:00"),
  items: [
    { name: "Biogesic 500mg Tablet", quantity: 2, unitPrice: 6.5, totalPrice: 13, isVatable: true },
    { name: "Ascorbic Acid 500mg Capsule", quantity: 10, unitPrice: 3.25, totalPrice: 32.5, isVatable: false },
  ],
  subtotal: 45.5,
  discountType: "NONE",
  discountAmount: 0,
  taxAmount: 1.39,
  vatableSales: 11.61,
  nonVatableSales: 32.5,
  vatableGross: 13,
  nonVatableGross: 32.5,
  vatableDiscountAmount: 0,
  nonVatableDiscountAmount: 0,
  vatRemovedFromVatable: 0,
  zeroRatedSales: 0,
  totalAmount: 45.5,
  paymentMethod: "CASH",
  cashReceived: 100,
  changeGiven: 54.5,
  cashier: { firstName: "Ana", lastName: "Reyes" },
  store: store(),
  ...over,
});

const scSale = sale({
  discountType: "SENIOR",
  discountName: "Senior Citizen",
  discountRate: "20%",
  discountVatExempt: true,
  discountAmount: 8.82,
  vatRemovedFromVatable: 1.39,
  vatableSales: 0,
  taxAmount: 0,
  vatExemptSales: 11.61,
  totalAmount: 35.29,
  cashReceived: 50,
  changeGiven: 14.71,
  discountHolderName: "Lola Remedios Cruz",
  discountIdNumber: "OSCA-0099",
  customer: { firstName: "Remedios", lastName: "Cruz" },
});

const SAMPLES: [string, ReceiptData][] = [
  ["regular cash", sale()],
  ["SC with ID", scSale],
  ["PWD, no holder name", sale({ ...scSale, discountType: "PWD", discountHolderName: undefined, discountIdNumber: undefined })],
  ["custom 10% discount", sale({ discountType: "PAYDAY", discountName: "Payday promo", discountRate: "10%", discountAmount: 4.55, totalAmount: 40.95, changeGiven: 59.05 })],
  ["e-wallet", sale({ paymentMethod: "E_WALLET", paymentProvider: "GCash", paymentReference: "1234 567 890", cashReceived: undefined, changeGiven: undefined })],
  ["points, partial", sale({ loyalty: { pointsRedeemed: 20, pointsAmount: 20, pointsEarned: 0, balanceAfter: 31 }, cashReceived: 30, changeGiven: 4.5 })],
  ["points, full", sale({ loyalty: { pointsRedeemed: 46, pointsAmount: 45.5, pointsEarned: 0, balanceAfter: 4 }, cashReceived: undefined, changeGiven: undefined })],
  ["points earned", sale({ customer: { firstName: "Jose", lastName: "Rizal" }, loyalty: { pointsRedeemed: 0, pointsAmount: 0, pointsEarned: 3, balanceAfter: 120 } })],
  ["long names and remarks", sale({
    items: [{ name: "Amoxicillin Trihydrate 500mg Capsule (Generic) — Box of 100", quantity: 100, unitPrice: 12345.67, totalPrice: 1234567, isVatable: true }],
    orderRemarks: "Take 1 capsule every 8 hours for 7 days.\nFinish the full course even if you feel better.",
    customer: { firstName: "Maria Clara Isabel", lastName: "de los Santos-Villanueva" },
  })],
  ["remarks off, no cashier, no customer name", sale({
    orderRemarks: "Should not print",
    customer: { firstName: "Hidden", lastName: "Name" },
    store: store({ includeOrderRemarks: false, showCashierName: false, showCustomerName: false }),
  })],
  ["two-line name, multi-line footer, all IDs", sale({
    store: store({
      storeName: "Botika ng Bayan\nBranch 2",
      permitNumber: "BP-2026-001",
      accreditationNumber: "ACC-77",
      serialNumberLabel: "SN-9",
      footerMessage: "Salamat po!\nGet well soon.",
      receiptTitle: "",
    }),
  })],
  ["return (negative amounts)", sale({
    saleNumber: "RET-20261118-0001",
    subtotal: -13, totalAmount: -13, taxAmount: -1.39, vatableSales: -11.61, nonVatableSales: 0,
    items: [{ name: "Biogesic 500mg Tablet", quantity: 2, unitPrice: 6.5, totalPrice: -13, isVatable: true }],
    cashReceived: undefined, changeGiven: undefined,
  })],
];

// ---------- simulating the paper ----------

type PaperLine = { text: string; align: "left" | "center" | "right"; bold: boolean };

// Reads today's ESC/POS string the way the printer does: alignment and bold
// are state, each \n ends a line, and a too-long line wraps at 32 characters.
function paperFromLegacy(escText: string, cols = 32): PaperLine[] {
  let align: PaperLine["align"] = "left";
  let bold = false;
  const lines: PaperLine[] = [];
  let current = "";
  let lineAlign: PaperLine["align"] = align;
  let lineBold = bold;
  let started = false;
  const flush = () => {
    const chars = Array.from(current);
    if (chars.length === 0) lines.push({ text: "", align: lineAlign, bold: lineBold });
    for (let i = 0; i < chars.length; i += cols) lines.push({ text: chars.slice(i, i + cols).join(""), align: lineAlign, bold: lineBold });
    current = "";
    started = false;
  };
  for (let i = 0; i < escText.length; i++) {
    const ch = escText[i];
    if (ch === "\x1B") {
      const cmd = escText[i + 1];
      if (cmd === "@") { align = "left"; bold = false; i += 1; continue; }
      if (cmd === "a") { align = escText[i + 2] === "1" ? "center" : escText[i + 2] === "2" ? "right" : "left"; i += 2; continue; }
      if (cmd === "E") { bold = escText[i + 2] === "1"; i += 2; continue; }
    }
    if (ch === "\x1D") { i += 2; continue; } // cut
    if (ch === "\n") { if (!started) { lineAlign = align; lineBold = bold; } flush(); continue; }
    if (!started) { lineAlign = align; lineBold = bold; started = true; }
    current += ch;
  }
  if (current) flush();
  return lines;
}

function paperFromDesign(t: Template, data: ReceiptData): PaperLine[] {
  return toPrintedLines(layoutReceipt(t, data), t.paperWidth).map((l) => {
    assert.equal(l.kind, "text");
    const line = l as Extract<typeof l, { kind: "text" }>;
    return { text: line.text, align: line.align, bold: line.bold };
  });
}

// Alignment can't be seen on a blank or full-width line, and bold can't be seen on a blank one.
const normalize = (lines: PaperLine[], cols = 32) =>
  lines.map((l) => {
    const blank = l.text.trim() === "";
    const full = Array.from(l.text).length >= cols;
    return `${blank || full ? "-" : l.align[0]}${blank ? "-" : l.bold ? "B" : "."}|${l.text}`;
  });

// ---------- tests ----------

for (const [name, data] of SAMPLES) {
  test(`Nookly Classic prints exactly like today's receipt: ${name}`, () => {
    const legacy = normalize(paperFromLegacy(generateThermalReceiptText(data)));
    const designed = normalize(paperFromDesign(buildPreset("classic", data.store), data));
    assert.deepEqual(designed, legacy);
  });
}

test("columns per paper width, font and size", () => {
  assert.equal(columnsFor(58, "A", 1), 32);
  assert.equal(columnsFor(58, "B", 1), 42);
  assert.equal(columnsFor(80, "A", 1), 48);
  assert.equal(columnsFor(80, "B", 1), 64);
  assert.equal(columnsFor(58, "A", 2), 16);
  assert.equal(columnsFor(80, "A", 3), 16);
  assert.equal(columnsFor(58, "A", 99), 4); // clamped to 8×
});

test("80mm lays out every line to 48 columns", () => {
  const t = buildPreset("classic", store(), 80);
  const lines = paperFromDesign(t, scSale);
  assert.ok(lines.every((l) => Array.from(l.text).length <= 48));
  assert.ok(lines.some((l) => l.text === "=".repeat(48)));
  const total = lines.find((l) => l.text.startsWith("TOTAL AMOUNT DUE:"))!;
  assert.equal(Array.from(total.text).length, 48);
  assert.ok(total.text.endsWith("₱35.29"));
});

test("every preset lays out for every sample at both widths without errors", () => {
  for (const key of ["classic", "chain", "compact", "promo"] as const) {
    for (const width of [58, 80] as const) {
      const t = buildPreset(key, store(), width);
      assert.deepEqual(sanitizeTemplate(t).errors, [], `${key} should be valid`);
      for (const [, data] of SAMPLES) {
        const printed = toPrintedLines(layoutReceipt(t, data), width);
        for (const l of printed) if (l.kind === "text") assert.ok(Array.from(l.text).length <= columnsFor(width, l.font, l.sizeW));
      }
    }
  }
});

test("the BIR notice prints even when the footer block is removed or hidden", () => {
  const t = buildPreset("compact", store());
  const noFooter = { ...t, blocks: t.blocks.filter((b) => b.type !== "footer") };
  const hidden = { ...t, blocks: t.blocks.map((b) => (b.type === "footer" ? { ...b, visible: false } : b)) };
  for (const design of [noFooter, hidden]) {
    const text = paperFromDesign(design, sale()).map((l) => l.text).join("");
    assert.ok(text.replace(/\s/g, "").includes("ThisreceiptisnotaBIR-accredited"), "notice missing");
  }
});

test("totals lines: values come from the sale, minus and hide-when-zero work", () => {
  const totals = newBlock("totals");
  if (totals.type !== "totals") throw new Error();
  totals.lines = [
    valueLine("grossTotal"),
    valueLine("discount", { minus: true, hideWhenZero: true }),
    valueLine("vatExemptSales", { hideWhenZero: true }),
    valueLine("totalDue", { label: "TOTAL:" }),
    valueLine("ewalletRef"),
  ];
  const t: Template = { version: 1, paperWidth: 58, printMode: "TEXT", theme: { style: {} }, blocks: [totals] };

  const plain = paperFromDesign(t, sale()).map((l) => l.text);
  assert.ok(plain.some((l) => l.startsWith("Total Sales:") && l.endsWith("₱45.50")));
  assert.ok(!plain.some((l) => l.startsWith("Less: Discount:")), "zero discount hidden");
  assert.ok(!plain.some((l) => l.startsWith("VAT-Exempt")), "zero VAT-exempt hidden");
  assert.ok(!plain.some((l) => l.startsWith("Ref No:")), "no e-wallet ref on a cash sale");

  const sc = paperFromDesign(t, scSale).map((l) => l.text);
  assert.ok(sc.some((l) => l.startsWith("Less: Discount:") && l.endsWith("-₱8.82")));
  assert.ok(sc.some((l) => l.startsWith("VAT-Exempt Sales:") && l.endsWith("₱11.61")));
  assert.ok(sc.some((l) => l.startsWith("TOTAL:") && l.endsWith("₱35.29")));
});

test("style inheritance: theme, then block, then line", () => {
  const s = resolveStyle({ font: "B", bold: true, color: "#111111" }, { bold: false, sizeW: 2 }, { color: "#ff0000" });
  assert.equal(s.font, "B");
  assert.equal(s.bold, false);
  assert.equal(s.sizeW, 2);
  assert.equal(s.color, "#ff0000");
  assert.equal(s.sizeH, 1);
});

test("text mode: big and Font B text wrap to their own column count", () => {
  const big = newBlock("text");
  if (big.type !== "text") throw new Error();
  big.text = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  big.style = { sizeW: 2 };
  const t: Template = { version: 1, paperWidth: 58, printMode: "TEXT", theme: { style: {} }, blocks: [big] };
  const lines = toPrintedLines(layoutReceipt(t, sale()), 58).filter((l) => l.kind === "text" && l.text && l.sizeW === 2);
  assert.deepEqual(lines.map((l) => (l as { text: string }).text), ["ABCDEFGHIJKLMNOP", "QRSTUVWXYZ"]);
});

test("validation: unknown fields dropped, numbers clamped, junk ignored", () => {
  const { template, errors } = sanitizeTemplate({
    paperWidth: 999,
    printMode: "HACK",
    theme: { style: { sizeW: 50, color: "red", fontFamily: "comic-sans", evil: true } },
    blocks: [
      { type: "text", text: "Hi", align: "middle", spaceBefore: 99, style: { fontSize: 1000, color: "#ABCDEF" }, extra: 1 },
      { type: "nope" },
      "garbage",
      { type: "totals", lines: [{ kind: "value", key: "notAKey" }, { kind: "value", key: "totalDue" }, { kind: "?" }] },
      { type: "saleDetails", fields: [{ key: "time", visible: true, label: "Oras:" }, { key: "time" }, { key: "bad" }] },
    ],
  });
  assert.deepEqual(errors, []);
  assert.equal(template.paperWidth, 58);
  assert.equal(template.printMode, "TEXT");
  assert.deepEqual(template.theme.style, { sizeW: 8 });
  assert.equal(template.blocks.length, 3);
  const [text, totals, details] = template.blocks;
  assert.ok(text.type === "text" && text.align === "center" && text.spaceBefore === 5);
  assert.deepEqual(text.style, { fontSize: 48, color: "#abcdef" });
  assert.ok(!("extra" in text));
  assert.ok(totals.type === "totals" && totals.lines.length === 1 && totals.lines[0].kind === "value");
  assert.ok(details.type === "saleDetails");
  assert.equal(details.fields[0].key, "time");
  assert.equal(details.fields[0].label, "Oras:");
  assert.equal(details.fields.length, 6, "missing fields come back hidden");
  assert.ok(details.fields.slice(1).every((f) => !f.visible));
});

test("validation: receipts can't be titled Official Receipt or Sales Invoice", () => {
  for (const text of ["OFFICIAL RECEIPT", "Official  Receipt No.", "SALES INVOICE", "service invoice"]) {
    const { errors } = sanitizeTemplate({ blocks: [{ type: "title", text }] });
    assert.equal(errors.length, 1, text);
  }
  const custom = sanitizeTemplate({ blocks: [{ type: "text", text: "This is an official receipt" }] });
  assert.equal(custom.errors.length, 1);
  const label = sanitizeTemplate({ blocks: [{ type: "totals", lines: [{ kind: "value", key: "totalDue", label: "Sales Invoice total" }] }] });
  assert.equal(label.errors.length, 1);
  assert.deepEqual(sanitizeTemplate({ blocks: [{ type: "title", text: "Acknowledgement Receipt" }] }).errors, []);
});

test("validation: a round trip keeps a preset unchanged", () => {
  for (const key of ["classic", "chain", "compact", "promo"] as const) {
    const t = buildPreset(key, store());
    assert.deepEqual(sanitizeTemplate(JSON.parse(JSON.stringify(t))).template, t);
  }
});

test("warnings point out missing Total, SC/PWD lines and AR number", () => {
  const classic = buildPreset("classic", store());
  assert.deepEqual(designWarnings(classic), []);
  const bare: Template = { ...classic, blocks: [newBlock("text"), newBlock("footer")] };
  const w = designWarnings(bare).join(" | ");
  assert.match(w, /Total amount due/);
  assert.match(w, /discount/);
  assert.match(w, /VAT exemption/);
  assert.match(w, /SC\/PWD info/);
  assert.match(w, /AR number/);
  assert.match(designWarnings({ ...classic, printMode: "IMAGE" }).join(), /slower/);
});
