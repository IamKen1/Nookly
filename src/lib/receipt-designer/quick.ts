// Quick edits made right on the preview: the text a part shows, its look, and
// where its number comes from. A part is a block, or one line of a Totals block.
import type { Align, Block, FormulaFormat, Style, TotalsKey, TotalsLine } from "./types";
import { TOTALS_FIELDS } from "./totals";
import { BLOCK_LABELS } from "./blocks";

export interface Part {
  blockId: string;
  lineId?: string | null;
}

const lineOf = (b: Block, lineId?: string | null): TotalsLine | null =>
  b.type === "totals" && lineId ? b.lines.find((l) => l.id === lineId) ?? null : null;

const withLine = (b: Block, lineId: string, change: (l: TotalsLine) => TotalsLine): Block =>
  b.type === "totals" ? { ...b, lines: b.lines.map((l) => (l.id === lineId ? change(l) : l)) } : b;

// ---------- the text typed in a part ----------

export interface EditableText {
  label: string; // what's being edited, for the hint ("Label", "Text")
  value: string;
  multiline: boolean;
  apply: (value: string) => Block;
}

export function editableText(b: Block, lineId?: string | null): EditableText | null {
  const line = lineOf(b, lineId);
  if (line) {
    if (line.kind === "value" || line.kind === "formula")
      return { label: "Label", value: line.label, multiline: false, apply: (v) => withLine(b, line.id, (l) => ({ ...l, label: v }) as TotalsLine) };
    if (line.kind === "heading")
      return { label: "Heading", value: line.text, multiline: false, apply: (v) => withLine(b, line.id, (l) => ({ ...l, text: v }) as TotalsLine) };
    return null;
  }
  switch (b.type) {
    case "text":
      return { label: "Text", value: b.text, multiline: true, apply: (v) => ({ ...b, text: v }) };
    case "title":
      return { label: "Title", value: b.text, multiline: false, apply: (v) => ({ ...b, text: v }) };
    case "field":
    case "formula":
      return { label: "Label", value: b.label, multiline: false, apply: (v) => ({ ...b, label: v }) };
    case "remarks":
      return { label: "Heading", value: b.heading, multiline: false, apply: (v) => ({ ...b, heading: v }) };
    case "qr":
      return { label: "Caption", value: b.caption, multiline: false, apply: (v) => ({ ...b, caption: v }) };
    case "items":
      return b.showItemCount ? { label: "Item count label", value: b.itemCountLabel, multiline: false, apply: (v) => ({ ...b, itemCountLabel: v }) } : null;
    default:
      return null;
  }
}

// ---------- look ----------

// The style the toolbar changes: the line's own, or the block's.
export function partStyle(b: Block, lineId?: string | null): Style {
  const line = lineOf(b, lineId);
  return line && line.kind !== "rule" ? line.style : b.style;
}

export function setPartStyle(b: Block, lineId: string | null | undefined, style: Style): Block {
  const line = lineOf(b, lineId);
  if (line && line.kind !== "rule") return withLine(b, line.id, (l) => ({ ...l, style }) as TotalsLine);
  return { ...b, style };
}

export function partAlign(b: Block, lineId?: string | null): Align {
  const line = lineOf(b, lineId);
  if (line && (line.kind === "heading" || line.kind === "value" || line.kind === "formula")) return line.align ?? "left";
  return b.align;
}

export function setPartAlign(b: Block, lineId: string | null | undefined, align: Align): Block {
  const line = lineOf(b, lineId);
  if (line && line.kind === "heading") return withLine(b, line.id, (l) => ({ ...l, align }) as TotalsLine);
  if (line && (line.kind === "value" || line.kind === "formula"))
    // A value on the right of its label can't be aligned; centering it means printing it on its own line.
    return withLine(b, line.id, (l) => ({ ...l, align, ...((l as { layout?: string }).layout ?? "pair") === "pair" && align !== "left" ? { layout: "inline" } : {} }) as TotalsLine);
  if (b.type === "field" || b.type === "formula") return { ...b, align, ...(b.layout === "pair" && align !== "left" ? { layout: "inline" as const } : {}) };
  return { ...b, align };
}

// ---------- where a number comes from ----------

export type Source = { kind: "field"; key: TotalsKey } | { kind: "formula"; expr: string; format: FormulaFormat };

export function partSource(b: Block, lineId?: string | null): Source | null {
  const line = lineOf(b, lineId);
  const it = line ?? b;
  if ((line ? line.kind : b.type) === "value" || b.type === "field") return { kind: "field", key: (it as { key: TotalsKey }).key };
  if ((line ? line.kind : b.type) === "formula") {
    const f = it as { expr: string; format: FormulaFormat };
    return { kind: "formula", expr: f.expr, format: f.format };
  }
  return null;
}

export function sourceName(s: Source): string {
  return s.kind === "field" ? TOTALS_FIELDS[s.key].name : `Formula: ${s.expr}`;
}

// Switches a value to another value, or to a formula, keeping its label and look.
export function setPartSource(b: Block, lineId: string | null | undefined, s: Source): Block {
  const line = lineOf(b, lineId);
  const common = (x: { label: string; minus: boolean; hideWhenZero: boolean }, defaultLabel: string) => ({
    // A label still at the old value's default follows the new value.
    label: s.kind === "field" && x.label === defaultLabel ? TOTALS_FIELDS[s.key].label : x.label,
    minus: x.minus,
    hideWhenZero: x.hideWhenZero,
  });
  if (line && (line.kind === "value" || line.kind === "formula")) {
    const def = line.kind === "value" ? TOTALS_FIELDS[line.key].label : "";
    const keep = { id: line.id, style: line.style, layout: line.layout, align: line.align, ...(line.showWhen ? { showWhen: line.showWhen } : {}) };
    const next: TotalsLine =
      s.kind === "field"
        ? { ...keep, kind: "value", key: s.key, ...common(line, def) }
        : { ...keep, kind: "formula", expr: s.expr, format: s.format, decimals: 2, ...common(line, def) };
    return withLine(b, line.id, () => next);
  }
  if (b.type === "field" || b.type === "formula") {
    const def = b.type === "field" ? TOTALS_FIELDS[b.key].label : "";
    const keep = { id: b.id, visible: b.visible, align: b.align, style: b.style, spaceBefore: b.spaceBefore, spaceAfter: b.spaceAfter, ruleBefore: b.ruleBefore, ruleAfter: b.ruleAfter, layout: b.layout, ...(b.showWhen ? { showWhen: b.showWhen } : {}) };
    return s.kind === "field"
      ? { ...keep, type: "field", key: s.key, ...common(b, def) }
      : { ...keep, type: "formula", expr: s.expr, format: s.format, decimals: 2, ...common(b, def) };
  }
  return b;
}

// What the selected part is, in a few words.
export function partName(b: Block, lineId?: string | null): string {
  const line = lineOf(b, lineId);
  if (line) {
    if (line.kind === "value") return TOTALS_FIELDS[line.key].name;
    if (line.kind === "formula") return "Formula";
    if (line.kind === "heading") return "Heading";
    if (line.kind === "computation") return "Standard computation";
    return "Divider";
  }
  return b.type === "field" ? TOTALS_FIELDS[b.key].name : BLOCK_LABELS[b.type];
}
