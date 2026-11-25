import type {
  Align, Block, BlockType, Condition, FieldLayout, FormulaFormat, ItemField, ItemFormat, ItemLine, PaperWidth, PrintMode,
  RowCell, RuleChar, SaleDetailField, SaleType, Style, Template, Theme, TotalsLine, ValueFormat,
} from "./types";
import { IMAGE_FONTS, TEMPLATE_VERSION } from "./types";
import { newBlock, newId, newItemCell, newRowCell, DEFAULT_SALE_DETAILS, DEFAULT_STORE_LABELS } from "./blocks";
import { DATE_FORMATS, DEFAULT_FORMAT, DEFAULT_VAT_CODES, TIME_FORMATS } from "./format";
import { TOTALS_FIELDS } from "./totals";
import { formulaError } from "./formula";

// Turns whatever was saved or sent into a well-formed design: unknown fields
// are dropped, numbers clamped, strings trimmed to size. Anything that would
// make the receipt pose as a BIR document is reported as an error.

const LIMITS = { blocks: 80, totalsLines: 40, text: 500, label: 60, qr: 300, formula: 300 };
const BLOCK_TYPES: BlockType[] = [
  "logo", "storeInfo", "title", "saleDetails", "items", "totals", "scPwd", "payment",
  "loyalty", "remarks", "text", "qr", "barcode", "rule", "footer", "field", "row", "formula",
];
const LAYOUTS: FieldLayout[] = ["pair", "inline", "value"];
const RULE_CHARS: RuleChar[] = ["-", "=", ".", "*", " "];
const ALIGNS: Align[] = ["left", "center", "right"];

// Nookly isn't BIR-accredited, so no text on the receipt may call it one of these
// ("Official Receipt", "Sales Invoice", "INVOICE#…", "This is your invoice").
const BIR_TITLES = /official\s*receipt|invoice/i;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown, max: number, fallback = "") => (typeof v === "string" ? v.slice(0, max) : fallback);
const bool = (v: unknown, fallback: boolean) => (typeof v === "boolean" ? v : fallback);
const num = (v: unknown, min: number, max: number, fallback: number) =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
const int = (v: unknown, min: number, max: number, fallback: number) => Math.round(num(v, min, max, fallback));
const oneOf = <T extends string>(v: unknown, options: readonly T[], fallback: T): T => (options.includes(v as T) ? (v as T) : fallback);
const color = (v: unknown) => (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : undefined);

export function sanitizeStyle(v: unknown): Style {
  if (!isObj(v)) return {};
  const s: Style = {};
  if (v.font === "A" || v.font === "B") s.font = v.font;
  if (v.sizeW !== undefined) s.sizeW = int(v.sizeW, 1, 8, 1);
  if (v.sizeH !== undefined) s.sizeH = int(v.sizeH, 1, 8, 1);
  if (typeof v.fontFamily === "string" && Object.hasOwn(IMAGE_FONTS, v.fontFamily)) s.fontFamily = v.fontFamily;
  if (v.fontSize !== undefined) s.fontSize = num(v.fontSize, 6, 48, 9);
  for (const k of ["bold", "italic", "underline", "inverse", "uppercase"] as const) if (typeof v[k] === "boolean") s[k] = v[k] as boolean;
  const c = color(v.color);
  if (c) s.color = c;
  if (v.background === null) s.background = null;
  else if (color(v.background)) s.background = color(v.background);
  if (v.lineHeight !== undefined) s.lineHeight = num(v.lineHeight, 0.8, 3, 1.3);
  if (v.letterSpacing !== undefined) s.letterSpacing = num(v.letterSpacing, -2, 10, 0);
  return s;
}

const SALE_TYPES: SaleType[] = ["scpwd", "discount", "noDiscount", "cash", "ewallet", "customer", "points"];
const FORMATS: FormulaFormat[] = ["money", "number", "percent", "int"];
const ITEM_FIELDS: ItemField[] = ["name", "generic", "barcode", "qty", "unitPrice", "total", "vat", "totalVat", "qtyXPrice", "qtyAtPrice", "text"];

function sanitizeFormat(v: unknown): ValueFormat | undefined {
  if (!isObj(v)) return undefined;
  const names = ["full", "first", "last", "firstLastInitial", "lastFirst"] as const;
  return {
    currency: oneOf(v.currency, ["peso", "none"] as const, DEFAULT_FORMAT.currency),
    date: oneOf(v.date, DATE_FORMATS.map((f) => f.value), DEFAULT_FORMAT.date),
    time: oneOf(v.time, TIME_FORMATS.map((f) => f.value), DEFAULT_FORMAT.time),
    cashierName: oneOf(v.cashierName, names, DEFAULT_FORMAT.cashierName),
    customerName: oneOf(v.customerName, names, DEFAULT_FORMAT.customerName),
  };
}

// A short marker such as V, N, X, T, Z, or "" for none.
const code = (v: unknown, fallback: string) => (typeof v === "string" ? v.slice(0, 3) : fallback);
const isDay = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

export function sanitizeCondition(v: unknown): Condition | undefined {
  if (!isObj(v)) return undefined;
  const c: Condition = {};
  if (Array.isArray(v.saleTypes)) {
    const types = [...new Set(v.saleTypes.filter((t): t is SaleType => SALE_TYPES.includes(t as SaleType)))];
    if (types.length) c.saleTypes = types;
  }
  if (typeof v.minTotal === "number" && Number.isFinite(v.minTotal)) c.minTotal = Math.max(0, v.minTotal);
  if (typeof v.maxTotal === "number" && Number.isFinite(v.maxTotal)) c.maxTotal = Math.max(0, v.maxTotal);
  if (isDay(v.fromDate)) c.fromDate = v.fromDate;
  if (isDay(v.toDate)) c.toDate = v.toDate;
  if (Array.isArray(v.branches)) {
    const ids = v.branches.filter((b): b is string => typeof b === "string" && b.length > 0 && b.length <= 64).slice(0, 50);
    if (ids.length) c.branches = ids;
  }
  return Object.keys(c).length ? c : undefined;
}

const withCondition = <T extends object>(item: T, v: Obj): T => {
  const showWhen = sanitizeCondition(v.showWhen);
  return showWhen ? { ...item, showWhen } : item;
};

function sanitizeRowCell(v: unknown): RowCell | null {
  if (!isObj(v)) return null;
  const d = newRowCell();
  const kind = oneOf(v.kind, ["field", "text", "formula"] as const, "field");
  const key = typeof v.key === "string" && Object.hasOwn(TOTALS_FIELDS, v.key) ? (v.key as RowCell["key"]) : d.key;
  return {
    id: str(v.id, 64) || d.id,
    kind,
    key,
    text: str(v.text, LIMITS.label),
    expr: str(v.expr, LIMITS.formula, d.expr),
    format: oneOf(v.format, FORMATS, "money"),
    decimals: int(v.decimals, 0, 6, 2),
    label: str(v.label, LIMITS.label),
    width: int(v.width, 0, 100, 0),
    align: oneOf(v.align, ALIGNS, "left"),
    minus: bool(v.minus, false),
  };
}

function sanitizeItemFormat(v: unknown): ItemFormat | null {
  if (!isObj(v) || !Array.isArray(v.lines)) return null;
  const lines = v.lines
    .slice(0, 4)
    .filter(isObj)
    .map((l): ItemLine => ({
      id: str(l.id, 64) || newId("l"),
      style: sanitizeStyle(l.style),
      cells: (Array.isArray(l.cells) ? l.cells : [])
        .slice(0, 6)
        .filter(isObj)
        .filter((c) => ITEM_FIELDS.includes(c.field as ItemField))
        .map((c) => {
          const field = c.field as ItemField;
          const d = newItemCell(field);
          return {
            id: str(c.id, 64) || d.id,
            field,
            text: str(c.text, LIMITS.label),
            title: typeof c.title === "string" ? c.title.slice(0, LIMITS.label) : d.title,
            width: int(c.width, 0, 100, 0),
            align: oneOf(c.align, ALIGNS, d.align),
          };
        }),
    }))
    .filter((l) => l.cells.length > 0);
  return lines.length ? { lines } : null;
}

function sanitizeTotalsLine(v: unknown): TotalsLine | null {
  const line = sanitizeTotalsLineBody(v);
  return line && isObj(v) ? withCondition(line, v) : line;
}

function sanitizeTotalsLineBody(v: unknown): TotalsLine | null {
  if (!isObj(v)) return null;
  const id = str(v.id, 64) || newId("t");
  switch (v.kind) {
    case "formula":
      return {
        id,
        kind: "formula",
        label: str(v.label, LIMITS.label),
        expr: str(v.expr, LIMITS.formula),
        format: oneOf(v.format, FORMATS, "money"),
        decimals: int(v.decimals, 0, 6, 2),
        style: sanitizeStyle(v.style),
        minus: bool(v.minus, false),
        hideWhenZero: bool(v.hideWhenZero, false),
        ...(LAYOUTS.includes(v.layout as FieldLayout) ? { layout: v.layout as FieldLayout } : {}),
        ...(ALIGNS.includes(v.align as Align) ? { align: v.align as Align } : {}),
      };
    case "computation":
      return { id, kind: "computation", style: sanitizeStyle(v.style) };
    case "rule":
      return { id, kind: "rule", char: oneOf(v.char, RULE_CHARS, "-") };
    case "heading":
      return { id, kind: "heading", text: str(v.text, LIMITS.label), align: oneOf(v.align, ALIGNS, "left"), style: sanitizeStyle(v.style) };
    case "value": {
      if (typeof v.key !== "string" || !Object.hasOwn(TOTALS_FIELDS, v.key)) return null;
      const key = v.key as keyof typeof TOTALS_FIELDS;
      return {
        id,
        kind: "value",
        key,
        label: typeof v.label === "string" ? v.label.slice(0, LIMITS.label) : TOTALS_FIELDS[key].label,
        style: sanitizeStyle(v.style),
        minus: bool(v.minus, false),
        hideWhenZero: bool(v.hideWhenZero, false),
        ...(LAYOUTS.includes(v.layout as FieldLayout) ? { layout: v.layout as FieldLayout } : {}),
        ...(ALIGNS.includes(v.align as Align) ? { align: v.align as Align } : {}),
      };
    }
    default:
      return null;
  }
}

function sanitizeBlock(v: unknown): Block | null {
  if (!isObj(v) || !BLOCK_TYPES.includes(v.type as BlockType)) return null;
  const d = newBlock(v.type as BlockType, str(v.id, 64) || newId());
  const common = {
    id: d.id,
    visible: bool(v.visible, true),
    align: oneOf(v.align, ALIGNS, d.align),
    style: sanitizeStyle(v.style),
    spaceBefore: int(v.spaceBefore, 0, 5, 0),
    spaceAfter: int(v.spaceAfter, 0, 5, 0),
    ruleBefore: v.ruleBefore === null || v.ruleBefore === undefined ? null : oneOf(v.ruleBefore, RULE_CHARS, "-"),
    ruleAfter: v.ruleAfter === null || v.ruleAfter === undefined ? null : oneOf(v.ruleAfter, RULE_CHARS, "-"),
    ...(sanitizeCondition(v.showWhen) ? { showWhen: sanitizeCondition(v.showWhen) } : {}),
  };

  switch (d.type) {
    case "logo":
      return { ...d, ...common, widthPct: int(v.widthPct, 10, 100, d.widthPct) };
    case "storeInfo": {
      const f = isObj(v.fields) ? v.fields : {};
      const fields = Object.fromEntries(Object.entries(d.fields).map(([k, def]) => [k, bool(f[k], def)])) as typeof d.fields;
      const l = isObj(v.labels) ? v.labels : {};
      const labels = Object.fromEntries(
        Object.entries(DEFAULT_STORE_LABELS).map(([k, def]) => [k, typeof l[k] === "string" ? (l[k] as string).slice(0, LIMITS.label) : def])
      ) as typeof d.labels;
      return { ...d, ...common, fields, labels, nameStyle: isObj(v.nameStyle) ? sanitizeStyle(v.nameStyle) : d.nameStyle };
    }
    case "title":
      return { ...d, ...common, text: str(v.text, LIMITS.label), uppercase: bool(v.uppercase, d.uppercase) };
    case "saleDetails": {
      const given = Array.isArray(v.fields) ? v.fields.filter(isObj) : [];
      const seen = new Set<string>();
      const fields: SaleDetailField[] = [];
      for (const f of given) {
        const def = DEFAULT_SALE_DETAILS.find((x) => x.key === f.key);
        if (!def || seen.has(def.key)) continue;
        seen.add(def.key);
        fields.push({ key: def.key, visible: bool(f.visible, def.visible), label: typeof f.label === "string" ? f.label.slice(0, LIMITS.label) : def.label });
      }
      // Fields missing from an older design come back hidden, in their usual order.
      for (const def of DEFAULT_SALE_DETAILS) if (!seen.has(def.key)) fields.push({ ...def, visible: given.length === 0 ? def.visible : false });
      return { ...d, ...common, fields };
    }
    case "items":
      return {
        ...d,
        ...common,
        header: bool(v.header, d.header),
        headerRule: bool(v.headerRule, d.headerRule),
        countRule: bool(v.countRule, d.countRule),
        headerLeft: str(v.headerLeft, LIMITS.label, d.headerLeft),
        headerRight: str(v.headerRight, LIMITS.label, d.headerRight),
        headerStyle: isObj(v.headerStyle) ? sanitizeStyle(v.headerStyle) : d.headerStyle,
        nameStyle: isObj(v.nameStyle) ? sanitizeStyle(v.nameStyle) : d.nameStyle,
        showVatMarker: bool(v.showVatMarker, d.showVatMarker),
        showGenericName: bool(v.showGenericName, d.showGenericName),
        showItemCount: bool(v.showItemCount, d.showItemCount),
        itemCountLabel: str(v.itemCountLabel, LIMITS.label, d.itemCountLabel),
        countMode: oneOf(v.countMode, ["pieces", "products"] as const, d.countMode),
        itemFormat: sanitizeItemFormat(v.itemFormat),
        vatCodes: (() => {
          const c = isObj(v.vatCodes) ? v.vatCodes : {};
          return { vatable: code(c.vatable, DEFAULT_VAT_CODES.vatable), exempt: code(c.exempt, DEFAULT_VAT_CODES.exempt), nonVat: code(c.nonVat, DEFAULT_VAT_CODES.nonVat) };
        })(),
      };
    case "row": {
      const cells = (Array.isArray(v.cells) ? v.cells : []).slice(0, 4).map(sanitizeRowCell).filter((c): c is RowCell => c !== null);
      return { ...d, ...common, cells: cells.length ? cells : d.cells, gap: int(v.gap, 0, 4, 1) };
    }
    case "formula":
      return {
        ...d,
        ...common,
        label: str(v.label, LIMITS.label),
        expr: str(v.expr, LIMITS.formula, d.expr),
        format: oneOf(v.format, FORMATS, "money"),
        decimals: int(v.decimals, 0, 6, 2),
        layout: oneOf(v.layout, LAYOUTS, "pair"),
        minus: bool(v.minus, false),
        hideWhenZero: bool(v.hideWhenZero, false),
      };
    case "field": {
      if (typeof v.key !== "string" || !Object.hasOwn(TOTALS_FIELDS, v.key)) return null;
      const key = v.key as keyof typeof TOTALS_FIELDS;
      return {
        ...d,
        ...common,
        key,
        label: typeof v.label === "string" ? v.label.slice(0, LIMITS.label) : TOTALS_FIELDS[key].label,
        layout: oneOf(v.layout, LAYOUTS, "pair"),
        minus: bool(v.minus, false),
        hideWhenZero: bool(v.hideWhenZero, false),
      };
    }
    case "totals": {
      const lines = Array.isArray(v.lines) ? v.lines.slice(0, LIMITS.totalsLines).map(sanitizeTotalsLine).filter((l): l is TotalsLine => l !== null) : d.lines;
      return { ...d, ...common, lines };
    }
    case "scPwd":
      return { ...d, ...common, titleStyle: isObj(v.titleStyle) ? sanitizeStyle(v.titleStyle) : d.titleStyle };
    case "payment":
      return {
        ...d,
        ...common,
        showPointsPaid: bool(v.showPointsPaid, d.showPointsPaid),
        showMethod: bool(v.showMethod, d.showMethod),
        showReference: bool(v.showReference, d.showReference),
        showCash: bool(v.showCash, d.showCash),
        showChange: bool(v.showChange, d.showChange),
        showPointsEarned: bool(v.showPointsEarned, d.showPointsEarned),
        showPointsBalance: bool(v.showPointsBalance, d.showPointsBalance),
        methodAsPair: bool(v.methodAsPair, d.methodAsPair),
      };
    case "loyalty":
      return { ...d, ...common, showEarned: bool(v.showEarned, d.showEarned), showBalance: bool(v.showBalance, d.showBalance) };
    case "remarks":
      return { ...d, ...common, heading: str(v.heading, LIMITS.label, d.heading), headingStyle: isObj(v.headingStyle) ? sanitizeStyle(v.headingStyle) : d.headingStyle };
    case "text":
      return { ...d, ...common, text: str(v.text, LIMITS.text) };
    case "qr":
      return { ...d, ...common, content: str(v.content, LIMITS.qr), sizePct: int(v.sizePct, 10, 100, d.sizePct), caption: str(v.caption, LIMITS.label) };
    case "barcode":
      return { ...d, ...common, height: int(v.height, 20, 200, d.height), showText: bool(v.showText, d.showText) };
    case "rule":
      return { ...d, ...common, char: oneOf(v.char, RULE_CHARS, d.char) };
    case "footer":
      return { ...d, ...common, noticeFirst: bool(v.noticeFirst, d.noticeFirst) };
  }
}

// Older saved designs are brought up to the current format here.
function upgrade(input: Obj): Obj {
  // Version 1 is the first format; future versions add steps here.
  return input;
}

export interface SanitizeResult {
  template: Template;
  errors: string[];
}

export function sanitizeTemplate(input: unknown): SanitizeResult {
  const v = upgrade(isObj(input) ? input : {});
  const errors: string[] = [];
  const blocksIn = Array.isArray(v.blocks) ? v.blocks : [];
  if (blocksIn.length > LIMITS.blocks) errors.push(`A receipt can have at most ${LIMITS.blocks} blocks.`);
  const blocks = blocksIn.slice(0, LIMITS.blocks).map(sanitizeBlock).filter((b): b is Block => b !== null);
  const format = sanitizeFormat(isObj(v.theme) ? v.theme.format : undefined);
  const theme: Theme = { style: sanitizeStyle(isObj(v.theme) ? v.theme.style : undefined), ...(format ? { format } : {}) };
  const template: Template = {
    version: TEMPLATE_VERSION,
    paperWidth: (v.paperWidth === 80 ? 80 : 58) as PaperWidth,
    printMode: oneOf<PrintMode>(v.printMode, ["TEXT", "IMAGE"], "TEXT"),
    theme,
    blocks,
  };
  for (const t of designTexts(template)) {
    if (BIR_TITLES.test(t)) {
      errors.push(`"${t.trim().slice(0, 40)}" can't be used: Nookly receipts aren't BIR-accredited Official Receipts or Sales Invoices.`);
    }
  }
  for (const { label, expr } of designFormulas(template)) {
    const problem = formulaError(expr);
    if (problem) errors.push(`Formula "${label.trim() || expr.slice(0, 30)}": ${problem}`);
  }
  return { template, errors };
}

// Every formula in the design, wherever it sits.
export function designFormulas(t: Template): { label: string; expr: string }[] {
  const out: { label: string; expr: string }[] = [];
  for (const b of t.blocks) {
    if (b.type === "formula") out.push({ label: b.label, expr: b.expr });
    if (b.type === "totals") b.lines.forEach((l) => l.kind === "formula" && out.push({ label: l.label, expr: l.expr }));
    if (b.type === "row") b.cells.forEach((c) => c.kind === "formula" && out.push({ label: c.label, expr: c.expr }));
  }
  return out;
}

// Every piece of text an owner typed into the design.
function designTexts(t: Template): string[] {
  const out: string[] = [];
  for (const b of t.blocks) {
    if (b.type === "title" || b.type === "text") out.push(b.text);
    if (b.type === "storeInfo") out.push(...Object.values(b.labels));
    if (b.type === "qr") out.push(b.caption);
    if (b.type === "remarks") out.push(b.heading);
    if (b.type === "items") out.push(b.headerLeft, b.headerRight, b.itemCountLabel);
    if (b.type === "saleDetails") b.fields.forEach((f) => out.push(f.label));
    if (b.type === "field" || b.type === "formula") out.push(b.label);
    if (b.type === "totals")
      b.lines.forEach((l) => (l.kind === "value" || l.kind === "formula" ? out.push(l.label) : l.kind === "heading" ? out.push(l.text) : null));
    if (b.type === "row") b.cells.forEach((c) => out.push(c.label, c.text));
    if (b.type === "items") b.itemFormat?.lines.forEach((l) => l.cells.forEach((c) => out.push(c.title, c.text)));
  }
  return out.filter(Boolean);
}

// What every receipt should have, as a checklist the designer shows with
// progress. Owners decide; nothing here blocks saving. `fix`: the tile that adds it.
export interface CheckItem {
  key: string;
  label: string;
  done: boolean;
  locked?: boolean; // always done, can't be removed
  warning: string; // shown when it's not done
  fix?: string;
}

export function designChecklist(t: Template): CheckItem[] {
  const visible = t.blocks.filter((b) => b.visible);
  const lines = visible.flatMap((b) => (b.type === "totals" ? b.lines : []));
  // A value counts as a line in a group, its own element, a column of a row, or a {token} in text.
  const texts = visible.flatMap((b) => (b.type === "text" || b.type === "title" ? [b.text] : []));
  const hasLine = (key: string) =>
    lines.some((l) => l.kind === "value" && l.key === key) ||
    visible.some((b) => (b.type === "field" && b.key === key) || (b.type === "row" && b.cells.some((c) => c.kind === "field" && c.key === key))) ||
    texts.some((s) => s.includes(`{${key}}`));
  const hasComputation = lines.some((l) => l.kind === "computation");
  return [
    { key: "total", label: "Total amount due", done: hasLine("totalDue"), warning: "There's no Total amount due line. Customers won't see what they paid.", fix: "totalDue" },
    { key: "discount", label: "SC/PWD discount", done: hasComputation || hasLine("discount"), warning: "SC/PWD sales won't show the discount. The law expects it on the receipt.", fix: "discount" },
    {
      key: "vatExempt",
      label: "VAT exemption (SC/PWD)",
      done: hasComputation || hasLine("vatExemptSales") || hasLine("vatRemoved"),
      warning: "SC/PWD sales won't show the VAT exemption. The law expects it on the receipt.",
      fix: "vatRemoved",
    },
    {
      key: "scInfo",
      label: "SC/PWD name, ID & signature",
      done: visible.some((b) => b.type === "scPwd") || hasLine("discountHolder") || hasLine("discountIdNumber"),
      warning: "There's no SC/PWD info block, so SC/PWD receipts won't have the name, ID and signature lines.",
      fix: "scPwd",
    },
    {
      key: "receiptNo",
      label: "AR number",
      done: visible.some((b) => b.type === "saleDetails" && b.fields.some((f) => f.key === "receiptNo" && f.visible)) || hasLine("receiptNo"),
      warning: "The AR number isn't shown. It's needed to look up the sale for returns and reprints.",
      fix: "receiptNo",
    },
    { key: "notice", label: "Not-BIR-accredited notice", done: true, locked: true, warning: "" },
  ];
}

// Advice shown in the designer. Owners decide; nothing here blocks saving.
export function designWarnings(t: Template): string[] {
  return [...designChecklist(t).filter((c) => !c.done).map((c) => c.warning), ...designNotes(t)];
}

// Advice that isn't a checklist item.
export function designNotes(t: Template): string[] {
  const warnings: string[] = [];
  const visible = t.blocks.filter((b) => b.visible);
  if (t.printMode === "IMAGE") warnings.push("Image mode prints slower, especially over Bluetooth (several seconds per receipt).");
  // A formula dressed up as the total could show the customer a different amount than they paid.
  for (const f of designFormulas({ ...t, blocks: visible })) {
    // Labels that read as the amount to pay ("TOTAL:", "Amount due"), not ones that merely mention it ("VAT-exclusive total").
    if (
      /^\s*(grand\s+)?total\b|^\s*amount\s*(due|to\s*pay)|babayaran|^\s*kabuuan/i.test(f.label) &&
      // "TOTAL AMOUNT w/o VAT" and the like are a step in the computation, not what was paid.
      !/w\/o\s*vat|without\s*vat|net\s*of\s*vat|vat[-\s]*excl/i.test(f.label) &&
      f.expr.replace(/\s/g, "") !== "total"
    )
      warnings.push(`Formula "${f.label.trim()}" looks like a total. Make sure it matches what the customer actually paid.`);
  }
  return warnings;
}
