// Run: npx tsx --test src/lib/receipt-designer/output.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import type { ReceiptData, ReceiptStoreSettings } from "@/types/receipt";
import { generateThermalReceiptText } from "@/lib/receipt";
import { textToEscPosBytes } from "@/lib/printer/encode";
import { buildPreset } from "./presets";
import { layoutReceipt } from "./layout";
import { toPrintedLines, type PrintedLine } from "./textmode";
import { encodeTextMode, encodeImageMode, barcodeBytes, rasterBytes, CMD } from "./escpos";
import { blankRaster, setDot, getDot, ditherToRaster, placeOnPaper, bands, qrRaster, rgbaToGray, PAPER_DOTS, qrMatrix } from "./raster";
import { textModeHtml, qrSvg, printDocument } from "./html";
import { newBlock } from "./blocks";
import { buildTestPage, rulerLines } from "./testpage";
import type { Template } from "./types";

const store: ReceiptStoreSettings = {
  storeName: "Botika ng Bayan",
  receiptTitle: "Acknowledgement Receipt (AR)",
  addressLine1: "123 Rizal Ave.",
  addressLine2: "Quezon City",
  contactNumber: "0917 123 4567",
  tin: "123-456-789-000",
  footerMessage: "Thank you!",
  showVatBreakdown: true,
  showCashierName: true,
  showCustomerName: true,
  includeOrderRemarks: true,
};

const sale = (over: Partial<ReceiptData> = {}): ReceiptData => ({
  saleNumber: "AR-20261118-0007",
  date: new Date("2026-11-18T09:41:00+08:00"),
  items: [
    { name: "Biogesic 500mg Tablet", quantity: 2, unitPrice: 6.5, totalPrice: 13, isVatable: true },
    { name: "Amoxicillin Trihydrate 500mg Capsule Box of 100", quantity: 1, unitPrice: 1234.5, totalPrice: 1234.5, isVatable: false },
  ],
  subtotal: 1247.5,
  discountType: "SENIOR",
  discountName: "Senior Citizen",
  discountRate: "20%",
  discountVatExempt: true,
  discountAmount: 249.73,
  vatRemovedFromVatable: 1.39,
  taxAmount: 0,
  vatableSales: 0,
  nonVatableSales: 987.6,
  vatableGross: 13,
  nonVatableGross: 1234.5,
  vatExemptSales: 11.61,
  totalAmount: 996.38,
  paymentMethod: "CASH",
  cashReceived: 1000,
  changeGiven: 3.62,
  discountHolderName: "Lola Remedios",
  orderRemarks: "Take 1 capsule every 8 hours.",
  cashier: { firstName: "Ana", lastName: "Reyes" },
  customer: { firstName: "Remedios", lastName: "Cruz" },
  loyalty: { pointsRedeemed: 0, pointsAmount: 0, pointsEarned: 19, balanceAfter: 120 },
  store,
  ...over,
});

// ---------- a tiny ESC/POS interpreter: bytes in, paper out ----------

type Paper = { text: string; align: string; bold: boolean; underline: boolean; inverse: boolean; font: string; w: number; h: number };

function printBytes(bytes: Uint8Array, cols58 = { A: 32, B: 42 }): { lines: Paper[]; rasters: number; barcodes: string[]; cut: boolean } {
  const st = { align: "left", bold: false, underline: false, inverse: false, font: "A", w: 1, h: 1 };
  const lines: Paper[] = [];
  const barcodes: string[] = [];
  let rasters = 0;
  let cut = false;
  let cur = "";
  let lineSt = { ...st };
  let started = false;
  const flush = () => {
    const cols = Math.floor(cols58[lineSt.font as "A" | "B"] / lineSt.w);
    const chars = Array.from(cur);
    if (!chars.length) lines.push({ text: "", ...lineSt });
    for (let i = 0; i < chars.length; i += cols) lines.push({ text: chars.slice(i, i + cols).join(""), ...lineSt });
    cur = "";
    started = false;
  };
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if (b === 0x1b) {
      const c = bytes[i + 1];
      const n = bytes[i + 2];
      if (c === 0x40) { Object.assign(st, { align: "left", bold: false, underline: false, inverse: false, font: "A", w: 1, h: 1 }); i += 1; continue; }
      if (c === 0x61) { st.align = n % 48 === 1 ? "center" : n % 48 === 2 ? "right" : "left"; i += 2; continue; }
      if (c === 0x45) { st.bold = (n & 1) === 1; i += 2; continue; }
      if (c === 0x2d) { st.underline = n % 48 > 0; i += 2; continue; }
      if (c === 0x4d) { st.font = n % 48 === 1 ? "B" : "A"; i += 2; continue; }
      throw new Error(`unknown ESC ${c}`);
    }
    if (b === 0x1d) {
      const c = bytes[i + 1];
      if (c === 0x21) { st.w = (bytes[i + 2] >> 4) + 1; st.h = (bytes[i + 2] & 15) + 1; i += 2; continue; }
      if (c === 0x42) { st.inverse = (bytes[i + 2] & 1) === 1; i += 2; continue; }
      if (c === 0x56) { cut = true; i += 2; continue; }
      if (c === 0x76) {
        const xB = bytes[i + 4] | (bytes[i + 5] << 8);
        const y = bytes[i + 6] | (bytes[i + 7] << 8);
        rasters++;
        i += 7 + xB * y;
        continue;
      }
      if (c === 0x68 || c === 0x77 || c === 0x48 || c === 0x66) { i += 2; continue; }
      if (c === 0x4c) { i += 3; continue; } // left margin
      if (c === 0x6b) {
        const len = bytes[i + 3];
        barcodes.push(String.fromCharCode(...bytes.slice(i + 4, i + 4 + len)));
        i += 3 + len;
        continue;
      }
      throw new Error(`unknown GS ${c}`);
    }
    if (b === 0x0a) { if (!started) lineSt = { ...st }; flush(); continue; }
    if (!started) { lineSt = { ...st }; started = true; }
    cur += String.fromCharCode(b);
  }
  if (cur) flush();
  return { lines, rasters, barcodes, cut };
}

const visible = (lines: Paper[]) =>
  lines.map((l) => {
    const blank = l.text.trim() === "";
    const full = l.text.length >= 32;
    return `${blank || full ? "-" : l.align[0]}${blank ? "-" : l.bold ? "B" : "."}|${l.text}`;
  });

// ---------- tests ----------

test("text mode bytes print exactly like today's receipt (Nookly Classic)", () => {
  for (const data of [sale(), sale({ discountType: "NONE", discountAmount: 0, loyalty: undefined, orderRemarks: undefined }), sale({ paymentMethod: "E_WALLET", paymentProvider: "GCash", paymentReference: "998877", cashReceived: undefined, changeGiven: undefined })]) {
    const legacy = printBytes(textToEscPosBytes(generateThermalReceiptText(data)));
    const t = buildPreset("classic", store);
    const designed = printBytes(encodeTextMode(toPrintedLines(layoutReceipt(t, data), 58), () => undefined));
    assert.deepEqual(visible(designed.lines), visible(legacy.lines));
    assert.equal(designed.cut, true);
    assert.equal(legacy.cut, true);
  }
});

test("text mode sets font, size, underline and inverse, and resets before the cut", () => {
  const block = newBlock("text");
  if (block.type !== "text") throw new Error();
  block.text = "PROMO";
  block.style = { font: "B", sizeW: 2, sizeH: 3, underline: true, inverse: true, bold: true };
  const t: Template = { version: 1, paperWidth: 58, printMode: "TEXT", theme: { style: {} }, blocks: [block] };
  const bytes = encodeTextMode(toPrintedLines(layoutReceipt(t, sale()), 58), () => undefined);
  const out = printBytes(bytes);
  const promo = out.lines.find((l) => l.text.includes("PROMO"))!;
  assert.deepEqual({ ...promo, text: promo.text.trim() }, { text: "PROMO", align: "center", bold: true, underline: true, inverse: true, font: "B", w: 2, h: 3 });
  // GS ! 0x12 = width 2, height 3
  assert.ok(Buffer.from(bytes).includes(Buffer.from([0x1d, 0x21, 0x12])));
  const tail = Array.from(bytes.slice(-21));
  assert.deepEqual(tail.slice(-3), CMD.cut);
  assert.ok(Buffer.from(tail).includes(Buffer.from([0x1d, 0x42, 0])), "inverse off before cut");
});

test("barcode: GS k Code 128 set B with the AR number", () => {
  const bytes = barcodeBytes("AR-20261118-0007", 60, true);
  assert.deepEqual(bytes.slice(0, 3), [0x1d, 0x68, 60]);
  const k = bytes.indexOf(0x6b);
  assert.equal(bytes[k + 1], 73);
  assert.equal(bytes[k + 2], "{BAR-20261118-0007".length);
  assert.equal(String.fromCharCode(...bytes.slice(k + 3)), "{BAR-20261118-0007");

  const t = buildPreset("chain", store);
  const out = printBytes(encodeTextMode(toPrintedLines(layoutReceipt(t, sale()), 58), () => undefined));
  assert.deepEqual(out.barcodes, ["{BAR-20261118-0007"]);
});

test("pictures: rasters are sent in bands; a missing logo is skipped", () => {
  const t = buildPreset("promo", store);
  t.blocks.unshift(newBlock("logo"));
  const s = sale({ store: { ...store, logoUrl: "https://example.com/logo.png" } });
  const lines = toPrintedLines(layoutReceipt(t, s), 58);
  const qrLine = lines.find((l) => l.kind === "qr")!;
  const qr = qrRaster("https://", 58, 50, "center");
  const withQr = printBytes(encodeTextMode(lines, (row) => (row === qrLine ? qr : undefined)));
  assert.equal(withQr.rasters, Math.ceil(qr.height / 128), "QR sent, logo skipped");
});

test("raster basics: dots, packing, placement, bands, header", () => {
  const r = blankRaster(10, 3);
  assert.equal(r.width, 16);
  setDot(r, 0, 0);
  setDot(r, 9, 2);
  assert.ok(getDot(r, 0, 0) && getDot(r, 9, 2) && !getDot(r, 1, 0));
  assert.equal(r.data[0], 0x80);
  assert.equal(r.data[2 * 2 + 1], 0x40);

  const placed = placeOnPaper(r, 384, "center");
  assert.equal(placed.width, 384);
  assert.ok(getDot(placed, 184, 0), "16 wide centered in 384 → offset 184");
  assert.ok(getDot(placeOnPaper(r, 384, "right"), 384 - 16, 0));

  const tall = blankRaster(384, 300);
  assert.deepEqual(bands(tall).map((b) => b.height), [128, 128, 44]);
  const header = rasterBytes(bands(tall)[2]).slice(0, 8);
  assert.deepEqual(header, [0x1d, 0x76, 0x30, 0x00, 48, 0, 44, 0]);
});

test("dithering: black, white and 50% gray", () => {
  const n = 64 * 64;
  const count = (r: ReturnType<typeof ditherToRaster>) => {
    let c = 0;
    for (let y = 0; y < r.height; y++) for (let x = 0; x < 64; x++) if (getDot(r, x, y)) c++;
    return c;
  };
  assert.equal(count(ditherToRaster(new Array(n).fill(0), 64, 64)), n);
  assert.equal(count(ditherToRaster(new Array(n).fill(255), 64, 64)), 0);
  const half = count(ditherToRaster(new Array(n).fill(128), 64, 64));
  assert.ok(Math.abs(half / n - 0.5) < 0.05, `50% gray → ${half / n}`);
  // transparent counts as white paper
  const rgba = new Uint8ClampedArray([0, 0, 0, 0, 0, 0, 0, 255]);
  assert.deepEqual(Array.from(rgbaToGray(rgba, 2, 1)), [255, 0]);
});

test("QR raster: whole dots per module, white quiet zone, finder pattern in place", () => {
  const r = qrRaster("https://facebook.com/botika", 58, 50, "center");
  assert.equal(r.width, PAPER_DOTS[58]);
  const m = qrMatrix("https://facebook.com/botika");
  const scale = Math.floor(Math.floor(384 * 0.5) / (m.size + 8));
  const side = (m.size + 8) * scale;
  assert.equal(r.height, side);
  const x0 = Math.floor((384 - Math.ceil(side / 8) * 8) / 2);
  for (let i = 0; i < 4 * scale; i++) assert.ok(!getDot(r, x0 + i, i), "quiet zone is white");
  assert.ok(getDot(r, x0 + 4 * scale, 4 * scale), "finder pattern corner is black");
  assert.ok(getDot(r, x0 + 4 * scale + 6 * scale, 4 * scale), "finder pattern is 7 modules wide");
  assert.ok(!getDot(r, x0 + 4 * scale + 7 * scale, 4 * scale), "separator after finder is white");
});

test("image mode: one picture in bands, feed, cut", () => {
  const r = blankRaster(576, 500);
  const out = printBytes(encodeImageMode(r));
  assert.equal(out.rasters, 4);
  assert.equal(out.cut, true);
  assert.equal(out.lines.length, 3, "3 feed lines");
});

test("printer test page: rulers, sizes, pictures, barcode, cut", () => {
  const page = printBytes(buildTestPage(58));
  const texts = page.lines.map((l) => l.text);
  assert.ok(texts.includes("Font A: 32 per line"));
  assert.ok(texts.includes("Font B: 42 per line"));
  assert.ok(texts.includes("12345678901234567890123456789012"), "Font A ruler, wrapped at 32 by the printer");
  assert.ok(texts.some((l) => l.trim() === "1         2         3"), "tens line");
  assert.ok(page.lines.some((l) => l.text.startsWith("3x3") && l.w === 3 && l.h === 3));
  assert.ok(page.lines.some((l) => l.text.includes("White on black") && l.inverse));
  assert.ok(page.lines.some((l) => l.text === "Right" && l.align === "right"));
  assert.ok(texts.includes("Peso sign: P100.00"));
  assert.ok(page.rasters >= 3, "edge strip, gray scale, QR");
  assert.deepEqual(page.barcodes, ["{BAR-TEST-0001"]);
  assert.equal(page.cut, true);

  const calibrated = printBytes(buildTestPage(58, { A: 30 }, 16));
  assert.ok(calibrated.lines.some((l) => l.text === "Font A: 30 per line"));
  assert.ok(calibrated.lines.some((l) => l.text === "Left margin: 16 dots"));
  const raw = Array.from(buildTestPage(58, {}, 16).slice(0, 6));
  assert.deepEqual(raw, [0x1b, 0x40, 0x1d, 0x4c, 16, 0], "GS L right after init");
  assert.deepEqual(rulerLines(12), ["         1  ", "123456789012"]);
});

test("left margin is sent with designed receipts when calibrated", () => {
  const t = buildPreset("compact", store);
  const lines = toPrintedLines(layoutReceipt(t, sale()), 58);
  assert.deepEqual(Array.from(encodeTextMode(lines, () => undefined, { leftMargin: 300 }).slice(0, 6)), [0x1b, 0x40, 0x1d, 0x4c, 300 & 0xff, 300 >> 8]);
  assert.deepEqual(Array.from(encodeTextMode(lines, () => undefined).slice(0, 4)), [0x1b, 0x40, 0x1b, 0x61], "no margin command without calibration");
});

test("HTML preview: escaped text, centered padding, inverse only on the text", () => {
  const lines: PrintedLine[] = [
    { kind: "text", text: "<Botika & Co>", align: "center", font: "A", sizeW: 1, sizeH: 1, bold: true, underline: false, inverse: false },
    { kind: "text", text: "PROMO", align: "center", font: "A", sizeW: 2, sizeH: 2, bold: false, underline: false, inverse: true },
  ];
  const html = textModeHtml(lines, 58);
  assert.ok(html.includes("&lt;Botika &amp; Co&gt;"));
  assert.ok(html.includes(`${" ".repeat(9)}<span>&lt;Botika`), "(32 − 13) / 2 = 9 spaces");
  assert.ok(html.includes(`${" ".repeat(5)}<span style="background:#000;color:#fff">PROMO`), "(16 − 5) / 2 = 5, spaces not inverted");
  assert.ok(html.includes("font-weight:700"));
  assert.ok(qrSvg("x").startsWith("<svg"));
  const doc = printDocument(html, 80, "AR-1", true);
  assert.ok(doc.includes("@page{size:80mm auto;margin:0}") && doc.includes("window.print()"));
});
