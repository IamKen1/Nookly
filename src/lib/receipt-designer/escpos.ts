import { escPosSafeText } from "@/lib/printer/encode";
import type { PrintedLine } from "./textmode";
import type { Raster } from "./raster";
import { bands } from "./raster";
import type { Row } from "./layout";

// ESC/POS commands (Epson standard, followed by the common 58/80mm printers).
const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

export const CMD = {
  init: [ESC, 0x40],
  align: (a: "left" | "center" | "right") => [ESC, 0x61, a === "center" ? 1 : a === "right" ? 2 : 0],
  bold: (on: boolean) => [ESC, 0x45, on ? 1 : 0],
  underline: (on: boolean) => [ESC, 0x2d, on ? 1 : 0],
  font: (f: "A" | "B") => [ESC, 0x4d, f === "B" ? 1 : 0],
  size: (w: number, h: number) => [GS, 0x21, ((clamp(w) - 1) << 4) | (clamp(h) - 1)],
  inverse: (on: boolean) => [GS, 0x42, on ? 1 : 0],
  // Same cut as today's receipt (GS V "1").
  cut: [GS, 0x56, 0x31],
};

const clamp = (n: number) => Math.min(8, Math.max(1, Math.round(n)));

// Text in the printer's single-byte code page; ₱ becomes P as on today's receipt.
export const textBytes = (s: string) => {
  const safe = escPosSafeText(s);
  const out: number[] = [];
  for (let i = 0; i < safe.length; i++) out.push(safe.charCodeAt(i) & 0xff);
  return out;
};

// GS v 0: one raster band.
export const rasterBytes = (r: Raster): number[] => {
  const xBytes = r.width / 8;
  return [GS, 0x76, 0x30, 0x00, xBytes & 0xff, xBytes >> 8, r.height & 0xff, r.height >> 8, ...r.data];
};

// GS k, Code 128 (code set B), with the number printed under the bars.
export const barcodeBytes = (content: string, height: number, showText: boolean): number[] => {
  const data = textBytes(`{B${content}`);
  return [
    GS, 0x68, Math.min(255, Math.max(1, Math.round(height))), // height in dots
    GS, 0x77, 2, // module width
    GS, 0x48, showText ? 2 : 0, // HRI below
    GS, 0x66, 0, // HRI font A
    GS, 0x6b, 73, data.length, ...data,
  ];
};

export type RasterFor = (row: Extract<Row, { kind: "image" | "qr" }>) => Raster | undefined;

// Text mode: the printer's own fonts, sizes, bold, underline and inverse,
// with pictures (logo, QR) sent as rasters prepared beforehand.
export function encodeTextMode(lines: PrintedLine[], rasterFor: RasterFor): Uint8Array {
  const out: number[] = [...CMD.init];
  // Today's receipt starts centered; set everything explicitly from here.
  let state = { align: "", font: "", w: 0, h: 0, bold: null as boolean | null, underline: null as boolean | null, inverse: null as boolean | null };
  const push = (bytes: number[]) => {
    for (const b of bytes) out.push(b);
  };

  for (const line of lines) {
    if (line.kind === "image" || line.kind === "qr") {
      const r = rasterFor(line);
      if (!r) continue;
      push(CMD.align("left"));
      state.align = "left";
      for (const band of bands(r)) push(rasterBytes(band));
      continue;
    }
    if (line.kind === "barcode") {
      push(CMD.align(line.align));
      state.align = line.align;
      push(barcodeBytes(line.content, line.height, line.showText));
      push([LF]);
      continue;
    }
    if (state.align !== line.align) push(CMD.align(line.align));
    if (state.font !== line.font) push(CMD.font(line.font));
    if (state.w !== line.sizeW || state.h !== line.sizeH) push(CMD.size(line.sizeW, line.sizeH));
    if (state.bold !== line.bold) push(CMD.bold(line.bold));
    if (state.underline !== line.underline) push(CMD.underline(line.underline));
    if (state.inverse !== line.inverse) push(CMD.inverse(line.inverse));
    state = { align: line.align, font: line.font, w: line.sizeW, h: line.sizeH, bold: line.bold, underline: line.underline, inverse: line.inverse };
    push(textBytes(line.text));
    push([LF]);
  }

  // Back to plain text so the next job starts clean, then cut.
  push([...CMD.size(1, 1), ...CMD.bold(false), ...CMD.underline(false), ...CMD.inverse(false), ...CMD.font("A"), ...CMD.align("left")]);
  push(CMD.cut);
  return Uint8Array.from(out);
}

// Image mode: the whole receipt is one picture, sent in bands, then cut.
export function encodeImageMode(receipt: Raster, feedLines = 3): Uint8Array {
  const out: number[] = [...CMD.init, ...CMD.align("left")];
  for (const band of bands(receipt)) for (const b of rasterBytes(band)) out.push(b);
  for (let i = 0; i < feedLines; i++) out.push(LF);
  for (const b of CMD.cut) out.push(b);
  return Uint8Array.from(out);
}
