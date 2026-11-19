import type { Align, PaperWidth } from "./types";
import type { Row } from "./layout";

// Characters per line for each printer font at size 1×: 384 dots (58mm) and
// 576 dots (80mm) wide; Font A is 12 dots per character, Font B 9.
const BASE_COLUMNS: Record<PaperWidth, { A: number; B: number }> = {
  58: { A: 32, B: 42 },
  80: { A: 48, B: 64 },
};

// A printer that fits a different number of characters than usual (some 58mm
// printers fit 30 or 33), set per device in the designer's printer calibration.
export interface ColumnOverride {
  A?: number | null;
  B?: number | null;
}

export const columnsFor = (paperWidth: PaperWidth, font: "A" | "B", sizeW: number, override?: ColumnOverride) =>
  Math.max(1, Math.floor((override?.[font] || BASE_COLUMNS[paperWidth][font]) / Math.min(8, Math.max(1, sizeW))));

// Splits a line's columns into widths that add up exactly (with `gap` between):
// fixed columns take their % of the line; the others ("auto") first get what
// their content needs (`need`), then share whatever is left. If the content
// doesn't fit, auto columns shrink in proportion and their text wraps.
export function columnWidths(cells: { width: number; need?: number }[], total: number, gap: number): number[] {
  const n = cells.length;
  if (n === 0) return [];
  const avail = Math.max(n, total - gap * (n - 1));
  const autos = cells.map((c, i) => (c.width > 0 ? -1 : i)).filter((i) => i >= 0);
  // Fixed columns leave at least one character for each auto column.
  const forFixed = Math.max(0, avail - autos.length);
  let fixed = cells.map((c) => (c.width > 0 ? Math.max(1, Math.floor((avail * Math.min(100, c.width)) / 100)) : 0));
  let used = fixed.reduce((a, b) => a + b, 0);
  if (used > forFixed && used > 0) {
    fixed = fixed.map((w) => (w ? Math.max(1, Math.floor((w * forFixed) / used)) : 0));
    used = fixed.reduce((a, b) => a + b, 0);
  }
  const widths = [...fixed];
  const left = Math.max(0, avail - used);
  if (autos.length === 0) {
    widths[n - 1] += left; // all fixed: the last column takes any remainder
    return widths;
  }
  const need = autos.map((i) => Math.max(1, cells[i].need ?? 1));
  const needTotal = need.reduce((a, b) => a + b, 0);
  if (needTotal <= left) {
    // Everything fits: each gets what it needs, the spare is shared (remainder to the last).
    const spare = left - needTotal;
    autos.forEach((i, k) => (widths[i] = need[k] + Math.floor(spare / autos.length) + (k === autos.length - 1 ? spare % autos.length : 0)));
  } else {
    // Too much content: short columns (qty, price) keep their full width and the
    // longest ones (usually the product name) give up space and wrap. Find the
    // largest cap C with sum(min(need, C)) <= left.
    let lo = 1;
    let hi = Math.max(...need);
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (need.reduce((s, n) => s + Math.min(n, mid), 0) <= left) lo = mid;
      else hi = mid - 1;
    }
    const capped = need.map((n) => Math.min(n, lo));
    let spare = left - capped.reduce((a, b) => a + b, 0);
    // Hand any leftover characters, one at a time, to the columns still short of what they need.
    while (spare > 0) {
      let gave = false;
      for (let k = 0; k < capped.length && spare > 0; k++) {
        if (need[k] > capped[k]) {
          capped[k]++;
          spare--;
          gave = true;
        }
      }
      if (!gave) break;
    }
    autos.forEach((i, k) => (widths[i] = Math.max(1, capped[k])));
  }
  return widths;
}

// Wraps at spaces where it can (columns), breaking only words longer than the column.
export function wrapWordsToWidth(s: string, width: number): string[] {
  const out: string[] = [];
  for (const para of s.split(/\r?\n/)) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (len(candidate) <= width) {
        line = candidate;
        continue;
      }
      if (line) out.push(line);
      if (len(word) > width) {
        const parts = chunk(word, width);
        out.push(...parts.slice(0, -1));
        line = parts[parts.length - 1];
      } else line = word;
    }
    out.push(line);
  }
  return out;
}

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

const pad = (s: string, width: number, align: Align) => {
  const gap = Math.max(0, width - len(s));
  return align === "right" ? " ".repeat(gap) + s : align === "center" ? " ".repeat(Math.floor(gap / 2)) + s + " ".repeat(Math.ceil(gap / 2)) : s + " ".repeat(gap);
};

// What each column of a table needs: rows sharing a `group` (an item table and
// its header) take the widest content of every row, so their columns line up.
const cellNeed = (text: string) => Math.max(1, ...text.split(/\r?\n/).map(len));
function groupNeeds(rows: Row[]): Map<string, number[]> {
  const needs = new Map<string, number[]>();
  for (const r of rows) {
    if (r.kind !== "columns" || !r.group) continue;
    const cur = needs.get(r.group) ?? [];
    r.cells.forEach((c, i) => (cur[i] = Math.max(cur[i] ?? 1, cellNeed(c.text))));
    needs.set(r.group, cur);
  }
  return needs;
}

export function toPrintedLines(rows: Row[], paperWidth: PaperWidth, override?: ColumnOverride): PrintedLine[] {
  const out: PrintedLine[] = [];
  const shared = groupNeeds(rows);
  for (const row of rows) {
    if (row.kind === "image" || row.kind === "qr" || row.kind === "barcode") {
      out.push(row);
      continue;
    }
    const s = row.style;
    const cols = columnsFor(paperWidth, s.font, s.sizeW, override);
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
      case "columns": {
        // Each cell wraps inside its own column; the line is as tall as the tallest cell.
        const groupNeed = row.group ? shared.get(row.group) : undefined;
        const widths = columnWidths(
          row.cells.map((c, i) => ({ width: c.width, need: groupNeed?.[i] ?? cellNeed(c.text) })),
          cols,
          row.gap
        );
        const wrapped = row.cells.map((c, i) => wrapWordsToWidth(c.text, widths[i]));
        const height = Math.max(...wrapped.map((w) => w.length));
        for (let r = 0; r < height; r++) {
          const text = row.cells.map((c, i) => pad(wrapped[i][r] ?? "", widths[i], c.align)).join(" ".repeat(row.gap));
          out.push(line(text.replace(/\s+$/, "")));
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
