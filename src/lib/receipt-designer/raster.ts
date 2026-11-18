import QRCode from "qrcode";
import type { Align, PaperWidth } from "./types";

// Thermal printers print 8 dots per mm across the paper's printable width.
export const PAPER_DOTS: Record<PaperWidth, number> = { 58: 384, 80: 576 };

// A 1-bit picture as the printer takes it: rows of bytes, 8 dots per byte,
// most significant bit leftmost, 1 = black.
export interface Raster {
  width: number; // dots, a multiple of 8
  height: number;
  data: Uint8Array; // (width / 8) * height bytes
}

export const blankRaster = (width: number, height: number): Raster => {
  const w = Math.ceil(width / 8) * 8;
  return { width: w, height, data: new Uint8Array((w / 8) * height) };
};

export const setDot = (r: Raster, x: number, y: number) => {
  if (x < 0 || y < 0 || x >= r.width || y >= r.height) return;
  r.data[y * (r.width / 8) + (x >> 3)] |= 0x80 >> (x & 7);
};

export const getDot = (r: Raster, x: number, y: number) => (r.data[y * (r.width / 8) + (x >> 3)] & (0x80 >> (x & 7))) !== 0;

// Grayscale (0 = black … 255 = white) to black and white. Floyd–Steinberg
// spreads each dot's rounding error to its neighbours, so grays and photos
// come out as fine dot patterns instead of solid blocks.
export function ditherToRaster(gray: Uint8ClampedArray | Float32Array | number[], width: number, height: number, dither = true): Raster {
  const r = blankRaster(width, height);
  const buf = Float32Array.from(gray as ArrayLike<number>);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const old = buf[i];
      const black = old < 128;
      if (black) setDot(r, x, y);
      if (!dither) continue;
      const err = old - (black ? 0 : 255);
      if (x + 1 < width) buf[i + 1] += (err * 7) / 16;
      if (y + 1 < height) {
        if (x > 0) buf[i + width - 1] += (err * 3) / 16;
        buf[i + width] += (err * 5) / 16;
        if (x + 1 < width) buf[i + width + 1] += err / 16;
      }
    }
  }
  return r;
}

// RGBA pixels (from a canvas) to grayscale, with transparency counted as white paper.
export function rgbaToGray(rgba: Uint8ClampedArray, width: number, height: number): Float32Array {
  const out = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const a = rgba[i * 4 + 3] / 255;
    const lum = 0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2];
    out[i] = lum * a + 255 * (1 - a);
  }
  return out;
}

// Places a picture on a full paper-width strip, so alignment works on every
// printer (some ignore alignment for pictures).
export function placeOnPaper(src: Raster, paperDots: number, align: Align): Raster {
  const out = blankRaster(paperDots, src.height);
  const offset = align === "center" ? Math.floor((paperDots - src.width) / 2) : align === "right" ? paperDots - src.width : 0;
  for (let y = 0; y < src.height; y++) for (let x = 0; x < src.width; x++) if (getDot(src, x, y)) setDot(out, x + Math.max(0, offset), y);
  return out;
}

// The QR code's modules (true = dark), with no quiet zone.
export function qrMatrix(content: string): { size: number; dark: (x: number, y: number) => boolean } {
  const qr = QRCode.create(content, { errorCorrectionLevel: "M" });
  const { size, data } = qr.modules;
  return { size, dark: (x, y) => Boolean(data[y * size + x]) };
}

// A QR code `sizePct` of the paper wide, with a 4-module quiet zone, in whole dots per module.
export function qrRaster(content: string, paperWidth: PaperWidth, sizePct: number, align: Align): Raster {
  const paperDots = PAPER_DOTS[paperWidth];
  const m = qrMatrix(content);
  const quiet = 4;
  const target = Math.floor((paperDots * Math.min(100, Math.max(10, sizePct))) / 100);
  const scale = Math.max(1, Math.floor(target / (m.size + quiet * 2)));
  const side = (m.size + quiet * 2) * scale;
  const qr = blankRaster(side, side);
  for (let y = 0; y < m.size; y++)
    for (let x = 0; x < m.size; x++)
      if (m.dark(x, y))
        for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) setDot(qr, (x + quiet) * scale + dx, (y + quiet) * scale + dy);
  return placeOnPaper(qr, paperDots, align);
}

// Splits a tall picture into bands the printer can buffer.
export function bands(r: Raster, maxRows = 128): Raster[] {
  const out: Raster[] = [];
  const rowBytes = r.width / 8;
  for (let y = 0; y < r.height; y += maxRows) {
    const h = Math.min(maxRows, r.height - y);
    out.push({ width: r.width, height: h, data: r.data.slice(y * rowBytes, (y + h) * rowBytes) });
  }
  return out;
}
