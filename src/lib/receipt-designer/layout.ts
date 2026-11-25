import type { ReceiptData } from "@/types/receipt";
import { formatPaymentMethodLabel, NOT_BIR_ACCREDITED_NOTICE, splitReceiptLines } from "@/types/receipt";
import { buildComputationLines, isSeniorOrPwd, loyaltyLines } from "@/lib/receipt";
import { phDayOf } from "@/lib/permissions-shared";
import type { Align, Block, Condition, FieldLayout, FormulaFormat, ItemCell, ResolvedStyle, RowCell, RuleChar, Style, Template, TotalsKey, TotalsLine, ValueFormat, VatCodes } from "./types";
import { resolveStyle } from "./style";
import { TOTALS_FIELDS, fillLabel } from "./totals";
import { computeFormula, formatFormula } from "./formula";
import { DEFAULT_FORMAT, formatDate, moneyFormatter } from "./format";

// A receipt as styled rows, before it's fitted to a paper width. Both the
// thermal output (textmode.ts) and the HTML output are made from these.
// blockId: which block it came from; lineId: which totals line (designer preview).
export type Row = RowBody & { blockId?: string; lineId?: string };

type RowBody =
  | { kind: "text"; text: string; align: Align; style: ResolvedStyle }
  // Label on the left, value on the right of the same line. `tight` keeps them
  // on one line however long (the item rows); otherwise a value that doesn't
  // fit moves to its own right-aligned line.
  | { kind: "pair"; left: string; right: string; style: ResolvedStyle; tight?: boolean }
  // Several cells side by side; width is % of the line (0 = share what's left).
  // `group`: rows of one table (item lines and their header) share column widths.
  | { kind: "columns"; cells: { text: string; width: number; align: Align }[]; gap: number; style: ResolvedStyle; group?: string }
  | { kind: "rule"; char: RuleChar; style: ResolvedStyle }
  | { kind: "feed"; lines: number; style: ResolvedStyle }
  | { kind: "image"; src: string; widthPct: number; align: Align }
  | { kind: "qr"; content: string; sizePct: number; align: Align }
  | { kind: "barcode"; content: string; height: number; showText: boolean; align: Align };

// Blank lines after the last row, so the receipt clears the cutter.
export const TAIL_FEED = 3;

// The design's value formats, passed to everything that writes a value.
interface Fx {
  vf: ValueFormat;
  money: (n: number) => string;
  cur: (s: string) => string; // drops ₱ from ready-made text when the design has no currency sign
}

// "Show only when…": true when every condition that's set holds for this sale.
export function conditionHolds(c: Condition | undefined, data: ReceiptData): boolean {
  if (!c) return true;
  const hasDiscount = Boolean(data.discountAmount && data.discountAmount > 0);
  for (const t of c.saleTypes ?? []) {
    const ok =
      t === "scpwd" ? hasDiscount && isSeniorOrPwd(data.discountType)
      : t === "discount" ? hasDiscount
      : t === "noDiscount" ? !hasDiscount
      : t === "cash" ? data.paymentMethod === "CASH"
      : t === "ewallet" ? data.paymentMethod === "E_WALLET"
      : t === "customer" ? Boolean(data.customer)
      : t === "sale" ? !data.receiptKind
      : t === "return" ? data.receiptKind === "RETURN"
      : t === "voided" ? data.receiptKind === "VOIDED"
      : t === "prescription" ? Boolean(data.prescription)
      : Boolean(data.loyalty && (data.loyalty.pointsRedeemed > 0 || data.loyalty.pointsEarned > 0));
    if (!ok) return false;
  }
  if (c.minTotal != null && data.totalAmount < c.minTotal - 0.005) return false;
  if (c.maxTotal != null && data.totalAmount > c.maxTotal + 0.005) return false;
  const day = phDayOf(data.date);
  if (c.fromDate && day < c.fromDate) return false;
  if (c.toDate && day > c.toDate) return false;
  if (c.branches && c.branches.length > 0 && !(data.storeId && c.branches.includes(data.storeId))) return false;
  return true;
}

const pieces = (data: ReceiptData) => data.items.reduce((s, i) => s + i.quantity, 0);

// Whether this sale made VATable items VAT-exempt (SC/PWD).
const saleIsVatExempt = (data: ReceiptData) =>
  (data.vatRemovedFromVatable ?? 0) > 0 ||
  (Boolean(data.discountAmount && data.discountAmount > 0) && (Boolean(data.discountVatExempt) || isSeniorOrPwd(data.discountType)));

const vatCode = (item: ReceiptData["items"][number], codes: VatCodes, exemptSale: boolean) =>
  item.isVatable ? (exemptSale ? codes.exempt : codes.vatable) : codes.nonVat;

// An expiry date (YYYY-MM-DD) in the design's date format.
const expiryText = (day: string, fx: Fx) => formatDate(new Date(`${day}T12:00:00+08:00`), fx.vf.date);

function itemCellText(cell: ItemCell, item: ReceiptData["items"][number], code: string, fx: Fx): string {
  switch (cell.field) {
    case "name": return item.name;
    case "generic": return item.genericName ?? "";
    case "barcode": return item.barcode ?? "";
    case "qty": return String(item.quantity);
    case "unitPrice": return fx.money(item.unitPrice);
    case "total": return fx.money(item.totalPrice);
    case "vat": return code;
    case "totalVat": return `${fx.money(item.totalPrice)}${code}`;
    case "qtyXPrice": return `${item.quantity} x ${fx.money(item.unitPrice)}`;
    case "qtyAtPrice": return `${item.quantity} @ ${fx.money(item.unitPrice)}`;
    case "dosage": return item.dosage?.trim() ?? "";
    case "lot": return (item.batches ?? []).map((b) => b.lot).join(", ");
    case "expiry": return (item.batches ?? []).map((b) => expiryText(b.expiry, fx)).join(", ");
    case "lotExpiry": return (item.batches ?? []).map((b) => `${b.lot} exp ${expiryText(b.expiry, fx)}`).join("; ");
    case "text": return cell.text;
  }
}

function formulaText(expr: string, format: FormulaFormat, decimals: number, minus: boolean, data: ReceiptData, fx: Fx): { text: string; value: number } | null {
  const v = computeFormula(expr, data);
  if (v === null) return null;
  const shown = minus && format === "money" ? -Math.abs(v) : v;
  return { text: formatFormula(shown, format, decimals, fx.money), value: v };
}

// A Row's cell as printed text, or null when its value doesn't apply to this sale.
function rowCellText(cell: RowCell, data: ReceiptData, fx: Fx): string | null {
  const withLabel = (v: string) => {
    const label = fillLabel(cell.label, data, fx.vf);
    return label.trim() ? `${label} ${v}` : v;
  };
  if (cell.kind === "text") return fillLabel(cell.text, data, fx.vf);
  if (cell.kind === "formula") {
    const r = formulaText(cell.expr, cell.format, cell.decimals, cell.minus, data, fx);
    return r ? withLabel(r.text) : null;
  }
  const field = TOTALS_FIELDS[cell.key];
  const v = field?.value(data, fx.vf);
  if (v === null || v === undefined || v === "") return null;
  return withLabel(field.format === "money" ? fx.money(cell.minus ? -Math.abs(v as number) : (v as number)) : String(v));
}

// ALL CAPS, applied to a block's rows once they're built.
function upper(row: Row): Row {
  if (!("style" in row) || !row.style.uppercase) return row;
  const u = (s: string) => s.toUpperCase();
  switch (row.kind) {
    case "text": return { ...row, text: u(row.text) };
    case "pair": return { ...row, left: u(row.left), right: u(row.right) };
    case "columns": return { ...row, cells: row.cells.map((c) => ({ ...c, text: u(c.text) })) };
    default: return row;
  }
}

// A return row saves only its totals; its VAT split and discount come from the
// original sale (in the share returned), so every line of a design adds up.
export const forDesign = (data: ReceiptData): ReceiptData => (data.returnParts ? { ...data, ...data.returnParts } : data);

// Printed above every design on a return or voided sale, so neither can pass
// for a sale. Not part of the design: owners can't remove it.
export function kindBanner(data: ReceiptData, theme: Style): Row[] {
  if (!data.receiptKind) return [];
  const big = resolveStyle(theme, { bold: true, sizeW: 2, sizeH: 2, fontSize: 16 });
  const plain = resolveStyle(theme);
  const out: Row[] =
    data.receiptKind === "RETURN"
      ? [
          { kind: "text", text: "RETURN / REFUND", align: "center", style: big },
          ...(data.originalSaleNumber ? [{ kind: "text" as const, text: `For ${data.originalSaleNumber}`, align: "center" as const, style: plain }] : []),
        ]
      : [
          { kind: "text", text: "*** VOIDED ***", align: "center", style: big },
          { kind: "text", text: "This sale was cancelled.", align: "center", style: plain },
        ];
  out.push({ kind: "rule", char: "=", style: plain });
  return out;
}

export function layoutReceipt(template: Template, sale: ReceiptData): Row[] {
  const data = forDesign(sale);
  const theme = template.theme.style;
  const vf: ValueFormat = { ...DEFAULT_FORMAT, ...template.theme.format };
  const fx: Fx = { vf, money: moneyFormatter(vf), cur: (s) => (vf.currency === "none" ? s.replace(/₱/g, "") : s) };
  const rows: Row[] = kindBanner(data, theme).map(upper);
  let noticePrinted = false;

  for (const block of template.blocks) {
    if (!block.visible || !conditionHolds(block.showWhen, data)) continue;
    const base = resolveStyle(theme, block.style);
    const at = (...extra: (Style | undefined)[]) => resolveStyle(theme, block.style, ...extra);
    const body = blockRows(block, data, base, at, fx).map(upper);
    if (block.type === "footer") noticePrinted = true;
    if (body.length === 0) continue;
    const own: Row[] = [];
    if (block.spaceBefore > 0) own.push({ kind: "feed", lines: block.spaceBefore, style: base });
    if (block.ruleBefore) own.push({ kind: "rule", char: block.ruleBefore, style: base });
    own.push(...body);
    if (block.ruleAfter) own.push({ kind: "rule", char: block.ruleAfter, style: base });
    if (block.spaceAfter > 0) own.push({ kind: "feed", lines: block.spaceAfter, style: base });
    for (const r of own) rows.push({ ...r, blockId: block.id });
  }

  // The notice is required on every receipt; a design without a footer still prints it.
  if (!noticePrinted) rows.push(upper({ kind: "text", text: NOT_BIR_ACCREDITED_NOTICE, align: "center", style: resolveStyle(theme) }));

  rows.push({ kind: "feed", lines: TAIL_FEED, style: resolveStyle(theme) });
  return rows;
}

function blockRows(
  block: Block,
  data: ReceiptData,
  base: ResolvedStyle,
  at: (...extra: (Style | undefined)[]) => ResolvedStyle,
  fx: Fx
): Row[] {
  const text = (t: string, style = base, align: Align = block.align): Row => ({ kind: "text", text: t, align, style });
  const pair = (left: string, right: string, style = base): Row => ({ kind: "pair", left, right, style });
  const fill = (t: string) => fillLabel(t, data, fx.vf);
  const store = data.store;

  switch (block.type) {
    case "logo":
      return store.logoUrl ? [{ kind: "image", src: store.logoUrl, widthPct: block.widthPct, align: block.align }] : [];

    case "storeInfo": {
      const f = block.fields;
      const out: Row[] = [];
      if (f.name) splitReceiptLines(store.storeName).forEach((l, i) => out.push(text(l, i === 0 ? at(block.nameStyle) : base)));
      if (f.address) splitReceiptLines(store.addressLine1, store.addressLine2).forEach((l) => out.push(text(l)));
      const l = block.labels;
      if (f.contact && store.contactNumber) out.push(text(`${l.contact}${store.contactNumber}`));
      if (f.tin && store.tin) out.push(text(`${l.tin}${store.tin}`));
      if (f.permit && store.permitNumber) out.push(text(`${l.permit}${store.permitNumber}`));
      if (f.accreditation && store.accreditationNumber) out.push(text(`${l.accreditation}${store.accreditationNumber}`));
      if (f.serial && store.serialNumberLabel) out.push(text(`${l.serial}${store.serialNumberLabel}`));
      return out;
    }

    case "title": {
      // An empty title follows Settings › Receipt's title.
      const t = fill(block.text.trim() || store.receiptTitle || "").trim();
      return t ? [text(block.uppercase ? t.toUpperCase() : t)] : [];
    }

    case "saleDetails": {
      const out: Row[] = [];
      for (const field of block.fields) {
        if (!field.visible) continue;
        const value = TOTALS_FIELDS[field.key].value(data, fx.vf);
        if (value) out.push(pair(fill(field.label), String(value)));
      }
      return out;
    }

    case "items": {
      const out: Row[] = [];
      const fmt = block.itemFormat;
      const exemptSale = saleIsVatExempt(data);
      if (block.header) {
        if (fmt && fmt.lines.length > 0) {
          // Column titles follow the widest item line (the one with the most columns).
          const widest = fmt.lines.reduce((a, b) => (b.cells.length > a.cells.length ? b : a));
          out.push({
            kind: "columns",
            cells: widest.cells.map((c) => ({ text: c.title, width: c.width, align: c.align })),
            gap: 1,
            style: at(block.headerStyle),
            group: `${block.id}:${widest.id}`,
          });
        } else {
          out.push(pair(block.headerLeft, block.headerRight, at(block.headerStyle)));
        }
        if (block.headerRule) out.push({ kind: "rule", char: "-", style: base });
      }
      if (fmt) {
        for (const item of data.items) {
          for (const line of fmt.lines) {
            const code = vatCode(item, block.vatCodes, exemptSale);
            const cells = line.cells.map((c) => ({ text: itemCellText(c, item, code, fx), width: c.width, align: c.align }));
            // Nothing to show for this item (a generic-name line for an item without one,
            // "Lot:" on an item without batches): skip the line, labels and all.
            if (line.cells.every((c, i) => cells[i].text === "" || c.field === "text") && line.cells.some((c) => c.field !== "text")) continue;
            if (cells.every((c) => c.text === "")) continue;
            out.push(
              cells.length === 1
                ? { kind: "text", text: cells[0].text, align: cells[0].align, style: at(line.style) }
                : { kind: "columns", cells, gap: 1, style: at(line.style), group: `${block.id}:${line.id}` }
            );
          }
        }
      }
      for (const item of fmt ? [] : data.items) {
        out.push(text(item.name, at(block.nameStyle), "left"));
        if (block.showGenericName && item.genericName) out.push(text(item.genericName, base, "left"));
        const amount = `${fx.money(item.totalPrice)}${block.showVatMarker ? ` ${vatCode(item, block.vatCodes, exemptSale)}` : ""}`;
        out.push({ kind: "pair", left: `${item.quantity} x ${fx.money(item.unitPrice)}`, right: amount, style: base, tight: true });
      }
      if (block.showItemCount) {
        if (block.countRule) out.push({ kind: "rule", char: "-", style: base });
        const count = block.countMode === "pieces" ? pieces(data) : data.items.length;
        out.push(text(`${fill(block.itemCountLabel)} ${count}`, base, "left"));
      }
      return out;
    }

    case "field":
      return fieldRows(block, block.align, base, data, fx);

    case "formula":
      return formulaRows(block, block.align, base, data, fx);

    case "row": {
      const cells = block.cells.map((c) => ({ c, text: rowCellText(c, data, fx) }));
      // Nothing to show when every value in the row is missing for this sale.
      if (cells.every(({ c, text }) => c.kind !== "text" && text === null) || cells.length === 0) return [];
      return [{ kind: "columns", cells: cells.map(({ c, text }) => ({ text: text ?? "", width: c.width, align: c.align })), gap: block.gap, style: base }];
    }

    case "totals":
      return block.lines.filter((line) => conditionHolds(line.showWhen, data)).flatMap((line) => totalsLineRows(line, data, base, at, fx).map((r) => ({ ...r, lineId: line.id })));

    case "scPwd": {
      if (!isSeniorOrPwd(data.discountType) || !(data.discountAmount && data.discountAmount > 0)) return [];
      return [
        text(`${data.discountType === "PWD" ? "PWD" : "SENIOR CITIZEN"} INFORMATION`, at(block.titleStyle), "center"),
        pair("Name:", data.discountHolderName?.trim() || "___________________"),
        pair("OSCA/PWD ID:", data.discountIdNumber?.trim() || "___________________"),
        text("Signature: _________________", base, "left"),
      ];
    }

    case "payment": {
      const loyalty = loyaltyLines(data);
      const out: Row[] = [];
      if (block.showPointsPaid) loyalty.payment.forEach(([l, v]) => out.push(pair(l, fx.cur(v))));
      const method = loyalty.paidWithPointsOnly ? "LOYALTY POINTS" : formatPaymentMethodLabel(data.paymentMethod, data.paymentProvider);
      if (block.showMethod) out.push(block.methodAsPair ? pair("Payment:", method) : text(`Payment: ${method}`, base, "left"));
      if (block.showReference && data.paymentReference)
        out.push(block.methodAsPair ? pair("Ref No:", data.paymentReference) : text(`Ref No: ${data.paymentReference}`, base, "left"));
      if (block.showCash && data.cashReceived) out.push(pair("Cash:", fx.money(data.cashReceived)));
      if (block.showChange && data.changeGiven && data.changeGiven > 0) out.push(pair("Change:", fx.money(data.changeGiven)));
      for (const [l, v] of loyalty.info) {
        if ((l === "Points earned:" && block.showPointsEarned) || (l === "Points balance:" && block.showPointsBalance)) out.push(pair(l, v));
      }
      return out;
    }

    case "loyalty": {
      const out: Row[] = [];
      for (const [l, v] of loyaltyLines(data).info) {
        if ((l === "Points earned:" && block.showEarned) || (l === "Points balance:" && block.showBalance)) out.push(pair(l, v));
      }
      return out;
    }

    case "remarks": {
      const remarks = data.orderRemarks?.trim();
      if (!remarks) return [];
      return [...(block.heading.trim() ? [text(fill(block.heading), at(block.headingStyle), "left")] : []), text(remarks, base, "left")];
    }

    case "text":
      return block.text.trim() ? [text(fill(block.text))] : [];

    case "qr":
      if (!block.content.trim()) return [];
      return [
        { kind: "qr", content: block.content.trim(), sizePct: block.sizePct, align: block.align },
        ...(block.caption.trim() ? [text(fill(block.caption))] : []),
      ];

    case "barcode":
      return [{ kind: "barcode", content: data.saleNumber, height: block.height, showText: block.showText, align: block.align }];

    case "rule":
      return [{ kind: "rule", char: block.char, style: base }];

    case "footer": {
      const message = store.footerMessage?.trim() ?? "";
      const notice = text(NOT_BIR_ACCREDITED_NOTICE);
      const msg = message ? [text(message)] : [];
      return block.noticeFirst ? [notice, ...msg] : [...msg, notice];
    }
  }
}

function totalsLineRows(
  line: TotalsLine,
  data: ReceiptData,
  base: ResolvedStyle,
  at: (...extra: (Style | undefined)[]) => ResolvedStyle,
  fx: Fx
): Row[] {
  switch (line.kind) {
    case "computation":
      return buildComputationLines(data).map((l) => ({
        kind: "pair" as const,
        left: `${l.label}:`,
        right: `${l.kind === "subtotal" ? "= " : ""}${fx.money(l.amount)}`,
        // Same emphasis as today's receipt: the starting figure, running totals and savings in bold.
        style: at(line.style, l.kind === "base" || l.kind === "subtotal" || l.kind === "savings" ? { bold: true } : undefined),
      }));
    case "heading":
      return line.text.trim() ? [{ kind: "text", text: fillLabel(line.text, data, fx.vf), align: line.align, style: at(line.style) }] : [];
    case "rule":
      return [{ kind: "rule", char: line.char, style: base }];
    case "value":
      return fieldRows(line, line.align ?? "left", at(line.style), data, fx);
    case "formula":
      return formulaRows(line, line.align ?? "left", at(line.style), data, fx);
  }
}

// An owner's formula, laid out like a value.
function formulaRows(
  f: { label: string; expr: string; format: FormulaFormat; decimals: number; layout?: FieldLayout; minus: boolean; hideWhenZero: boolean },
  align: Align,
  style: ResolvedStyle,
  data: ReceiptData,
  fx: Fx
): Row[] {
  const r = formulaText(f.expr, f.format, f.decimals, f.minus, data, fx);
  if (!r) return [];
  if (f.hideWhenZero && Math.abs(r.value) < 0.005) return [];
  return placeValue(fillLabel(f.label, data, fx.vf), r.text, f.layout ?? "pair", align, style);
}

function placeValue(label: string, shown: string, layout: FieldLayout, align: Align, style: ResolvedStyle): Row[] {
  if (layout === "value" || (layout === "pair" && !label.trim())) return [{ kind: "text", text: shown, align, style }];
  if (layout === "inline") return [{ kind: "text", text: `${label}${label.trim() ? " " : ""}${shown}`, align, style }];
  return [{ kind: "pair", left: label, right: shown, style }];
}

// One value from the sale, as its own element or a line in a group.
function fieldRows(
  f: { key: TotalsKey; label: string; layout?: FieldLayout; minus: boolean; hideWhenZero: boolean },
  align: Align,
  style: ResolvedStyle,
  data: ReceiptData,
  fx: Fx
): Row[] {
  const field = TOTALS_FIELDS[f.key];
  if (!field) return [];
  const value = field.value(data, fx.vf);
  if (value === null || value === "") return [];
  if (typeof value === "number" && f.hideWhenZero && Math.abs(value) < 0.005) return [];
  const shown = field.format === "money" ? fx.money(f.minus ? -Math.abs(value as number) : (value as number)) : String(value);
  return placeValue(fillLabel(f.label, data, fx.vf), shown, f.layout ?? "pair", align, style);
}
