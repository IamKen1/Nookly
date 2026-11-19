// A printer test page: shows how many characters fit per line (Font A and B),
// the sizes, styles and alignment the designer offers, a QR code, a barcode, a
// gray scale and the printable edges — so an owner can see what their printer
// does and calibrate it.

import { CMD, barcodeBytes, rasterBytes, textBytes } from "./escpos";
import { PAPER_DOTS, bands, blankRaster, ditherToRaster, qrRaster, setDot, type Raster } from "./raster";
import { columnsFor, type ColumnOverride } from "./textmode";
import type { PaperWidth } from "./types";

const LF = 0x0a;

// "123456789012345…" with the tens above it, a few characters longer than the
// expected width: where the printer wraps shows how many characters really fit.
export function rulerLines(length: number): [string, string] {
  let tens = "";
  let units = "";
  for (let i = 1; i <= length; i++) {
    tens += i % 10 === 0 ? String((i / 10) % 10) : " ";
    units += String(i % 10);
  }
  return [tens, units];
}

// A full-width strip with marks every 8 dots (1mm) and taller marks every 40:
// any marks missing at the edges show the printer can't reach them.
function edgeStrip(paperDots: number): Raster {
  const r = blankRaster(paperDots, 24);
  for (let x = 0; x < paperDots; x++) setDot(r, x, 0);
  for (let x = 0; x < paperDots; x += 8) {
    const h = x % 40 === 0 ? 24 : 12;
    for (let y = 0; y < h; y++) setDot(r, x, y);
  }
  for (let y = 0; y < 24; y++) setDot(r, paperDots - 1, y);
  return r;
}

function grayScale(paperDots: number): Raster {
  const w = paperDots;
  const h = 32;
  const gray: number[] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) gray.push(Math.round((x / (w - 1)) * 255));
  return ditherToRaster(gray, w, h);
}

export function buildTestPage(paperWidth: PaperWidth, override: ColumnOverride = {}, leftMargin = 0): Uint8Array {
  const out: number[] = [...CMD.init, ...(leftMargin ? CMD.leftMargin(leftMargin) : [])];
  const push = (...bytes: number[][]) => bytes.forEach((b) => b.forEach((x) => out.push(x)));
  const text = (s: string) => push(textBytes(s), [LF]);
  const style = (o: { align?: "left" | "center" | "right"; font?: "A" | "B"; w?: number; h?: number; bold?: boolean; underline?: boolean; inverse?: boolean } = {}) =>
    push(CMD.align(o.align ?? "left"), CMD.font(o.font ?? "A"), CMD.size(o.w ?? 1, o.h ?? 1), CMD.bold(Boolean(o.bold)), CMD.underline(Boolean(o.underline)), CMD.inverse(Boolean(o.inverse)));
  const picture = (r: Raster) => {
    push(CMD.align("left"));
    for (const b of bands(r)) push(rasterBytes(b));
  };
  const dots = PAPER_DOTS[paperWidth];

  style({ align: "center", bold: true, w: 2, h: 2 });
  text("TEST PAGE");
  style({ align: "center" });
  text(`Receipt designer - ${paperWidth}mm`);
  text(leftMargin ? `Left margin: ${leftMargin} dots` : "Left margin: none");
  text("");

  for (const font of ["A", "B"] as const) {
    const expected = columnsFor(paperWidth, font, 1, override);
    style({ bold: true });
    text(`Font ${font}: ${expected} per line`);
    style({ font });
    const [tens, units] = rulerLines(expected + 4);
    text(tens);
    text(units);
    style();
    text("Where the digits wrap shows");
    text("how many characters fit.");
    text("");
  }

  style({ bold: true });
  text("Sizes (width x height)");
  for (const [w, h] of [[1, 1], [1, 2], [2, 1], [2, 2], [3, 3]] as const) {
    style({ w, h });
    text(`${w}x${h} Abc`);
  }
  style();
  text("");

  style({ bold: true });
  text("Styles and alignment");
  style({ bold: true });
  text("Bold");
  style({ underline: true });
  text("Underline");
  style({ inverse: true });
  text(" White on black ");
  style({ align: "left" });
  text("Left");
  style({ align: "center" });
  text("Center");
  style({ align: "right" });
  text("Right");
  style();
  text("Peso sign: ₱100.00");
  text("");

  style({ bold: true });
  text("Edges (a mark every 1mm)");
  style();
  picture(edgeStrip(dots));
  text("");
  text("Gray (image mode shades)");
  picture(grayScale(dots));
  text("");
  text("QR (reads NOOKLY TEST)");
  picture(qrRaster("NOOKLY TEST", paperWidth, 45, "center"));
  text("");
  text("Barcode");
  push(CMD.align("center"), barcodeBytes("AR-TEST-0001", 60, true), [LF]);
  style({ align: "center" });
  text("");
  text("End of test page");
  push([LF, LF, LF], CMD.cut);
  return Uint8Array.from(out);
}
