// Printer calibration for THIS device (each counter has its own printer), kept
// in the browser. Some printers fit a different number of characters than the
// usual 32/42 (58mm) or 48/64 (80mm), or start printing a little in from the
// left. Used by the receipt designer's printing and preview.

import type { PaperWidth } from "@/lib/receipt-designer/types";

export interface Calibration {
  cols: Record<PaperWidth, { A: number | null; B: number | null }>;
  leftMargin: number; // dots (8 per mm)
}

const KEY = "nookly.printerCalibration";
export const DEFAULT_CALIBRATION: Calibration = { cols: { 58: { A: null, B: null }, 80: { A: null, B: null } }, leftMargin: 0 };

const clampCols = (v: unknown, min: number, max: number) =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : null;

export function readCalibration(): Calibration {
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(KEY) : null;
    if (!raw) return DEFAULT_CALIBRATION;
    const v = JSON.parse(raw) as Partial<Calibration>;
    return {
      cols: {
        58: { A: clampCols(v.cols?.[58]?.A, 20, 40), B: clampCols(v.cols?.[58]?.B, 28, 56) },
        80: { A: clampCols(v.cols?.[80]?.A, 36, 56), B: clampCols(v.cols?.[80]?.B, 48, 72) },
      },
      leftMargin: clampCols(v.leftMargin, 0, 64) ?? 0,
    };
  } catch {
    return DEFAULT_CALIBRATION; // private window or blocked storage: use the standard widths
  }
}

export function writeCalibration(c: Calibration) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(c));
  } catch {
    // not saved; printing still works with the standard widths
  }
}
