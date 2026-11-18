import type { Align, PaperWidth } from "./types";
import type { Row } from "./layout";

// Characters per line for each printer font at size 1×: 384 dots (58mm) and
// 576 dots (80mm) wide; Font A is 12 dots per character, Font B 9.
const BASE_COLUMNS: Record<PaperWidth, { A: number; B: number }> = {
  58: { A: 32, B: 42 },
  80: { A: 48, B: 64 },
};

export const columnsFor = (paperWidth: PaperWidth, font: "A" | "B", sizeW: number) =>
  Math.max(1, Math.floor(BASE_COLUMNS[paperWidth][font] / Math.min(8, Math.max(1, sizeW))));

// One line exactly as the thermal printer prints it in text mode.
export type PrintedLine =
  | {
      kind: "text";
      text: string;
      align: Align;
      font: "A" | "B";
      sizeW: number;
      sizeH: number;
      bold: boolean;
      underline: boolean;
      inverse: boolean;
      blockId?: string;
    }
  | Extract<Row, { kind: "image" | "qr" | "barcode" }>;

// Breaks text at exactly `cols` characters, the way the printer wraps a line
// that's too long, so what's previewed is what prints.
const chunk = (s: string, cols: number): string[] => {
  const chars = Array.from(s);
  if (chars.length === 0) return [""];
  const out: string[] = [];
  for (let i = 0; i < chars.length; i += cols) out.push(chars.slice(i, i + cols).join(""));
  return out;
};

const len = (s: string) => Array.from(s).length;

export function toPrintedLines(rows: Row[], paperWidth: PaperWidth): PrintedLine[] {
  const out: PrintedLine[] = [];
  for (const row of rows) {
    if (row.kind === "image" || row.kind === "qr" || row.kind === "barcode") {
      out.push(row);
      continue;
    }
    const s = row.style;
    const cols = columnsFor(paperWidth, s.font, s.sizeW);
    const line = (text: string, align: Align = "left"): PrintedLine => ({
      kind: "text",
      text,
      align,
      font: s.font,
      sizeW: s.sizeW,
      sizeH: s.sizeH,
      bold: s.bold,
      underline: s.underline,
      inverse: s.inverse,
      ...(row.blockId ? { blockId: row.blockId } : {}),
    });

    switch (row.kind) {
      case "text":
        for (const para of row.text.split(/\r?\n/)) for (const c of chunk(para, cols)) out.push(line(c, row.align));
        break;
      case "pair": {
        const spaces = cols - len(row.left) - len(row.right);
        if (row.tight) {
          for (const c of chunk(row.left + " ".repeat(Math.max(0, spaces)) + row.right, cols)) out.push(line(c));
        } else if (spaces < 1) {
          for (const c of chunk(row.left, cols)) out.push(line(c));
          for (const c of chunk(" ".repeat(Math.max(0, cols - len(row.right))) + row.right, cols)) out.push(line(c));
        } else {
          out.push(line(row.left + " ".repeat(spaces) + row.right));
        }
        break;
      }
      case "rule":
        out.push(line(row.char.repeat(cols)));
        break;
      case "feed":
        for (let i = 0; i < row.lines; i++) out.push(line(""));
        break;
    }
  }
  return out;
}
