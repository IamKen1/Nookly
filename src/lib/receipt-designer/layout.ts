import type { ReceiptData } from "@/types/receipt";
import { formatPaymentMethodLabel, NOT_BIR_ACCREDITED_NOTICE, splitReceiptLines } from "@/types/receipt";
import { buildComputationLines, isSeniorOrPwd, loyaltyLines, peso } from "@/lib/receipt";
import { phDayOf } from "@/lib/permissions-shared";
import type { Align, Block, Condition, FieldLayout, FormulaFormat, ItemCell, ResolvedStyle, RowCell, RuleChar, Style, Template, TotalsKey, TotalsLine } from "./types";
import { resolveStyle } from "./style";
import { TOTALS_FIELDS, fillLabel } from "./totals";
import { computeFormula, formatFormula } from "./formula";

// A receipt as styled rows, before it's fitted to a paper width. Both the
// thermal output (textmode.ts) and the HTML output are made from these.
export type Row = RowBody & { blockId?: string }; // blockId: which block it came from (designer preview)

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

const fullName = (p: { firstName: string; lastName: string }) => `${p.firstName} ${p.lastName}`;

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

function itemCellText(cell: ItemCell, item: ReceiptData["items"][number]): string {
  switch (cell.field) {
    case "name": return item.name;
    case "generic": return item.genericName ?? "";
    case "qty": return String(item.quantity);
    case "unitPrice": return peso(item.unitPrice);
    case "total": return peso(item.totalPrice);
    case "vat": return item.isVatable ? "V" : "N";
    case "qtyXPrice": return `${item.quantity} x ${peso(item.unitPrice)}`;
    case "text": return cell.text;
  }
}

function formulaText(expr: string, format: FormulaFormat, decimals: number, minus: boolean, data: ReceiptData): { text: string; value: number } | null {
  const v = computeFormula(expr, data);
  if (v === null) return null;
  const shown = minus && format === "money" ? -Math.abs(v) : v;
  return { text: formatFormula(shown, format, decimals, peso), value: v };
}

// A Row's cell as printed text, or null when its value doesn't apply to this sale.
function rowCellText(cell: RowCell, data: ReceiptData): string | null {
  const withLabel = (v: string) => {
    const label = fillLabel(cell.label, data);
    return label.trim() ? `${label} ${v}` : v;
  };
  if (cell.kind === "text") return fillLabel(cell.text, data);
  if (cell.kind === "formula") {
    const r = formulaText(cell.expr, cell.format, cell.decimals, cell.minus, data);
    return r ? withLabel(r.text) : null;
  }
  const field = TOTALS_FIELDS[cell.key];
  const v = field?.value(data);
  if (v === null || v === undefined || v === "") return null;
  return withLabel(field.format === "money" ? peso(cell.minus ? -Math.abs(v as number) : (v as number)) : String(v));
}

export function layoutReceipt(template: Template, data: ReceiptData): Row[] {
  const theme = template.theme.style;
  const rows: Row[] = [];
  let noticePrinted = false;

  for (const block of template.blocks) {
    if (!block.visible || !conditionHolds(block.showWhen, data)) continue;
    const base = resolveStyle(theme, block.style);
    const at = (...extra: (Style | undefined)[]) => resolveStyle(theme, block.style, ...extra);
    const body = blockRows(block, data, base, at);
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
  if (!noticePrinted) rows.push({ kind: "text", text: NOT_BIR_ACCREDITED_NOTICE, align: "center", style: resolveStyle(theme) });

  rows.push({ kind: "feed", lines: TAIL_FEED, style: resolveStyle(theme) });
  return rows;
}

function blockRows(
  block: Block,
  data: ReceiptData,
  base: ResolvedStyle,
  at: (...extra: (Style | undefined)[]) => ResolvedStyle
): Row[] {
  const text = (t: string, style = base, align: Align = block.align): Row => ({ kind: "text", text: t, align, style });
  const pair = (left: string, right: string, style = base): Row => ({ kind: "pair", left, right, style });
  const store = data.store;

  switch (block.type) {
    case "logo":
      return store.logoUrl ? [{ kind: "image", src: store.logoUrl, widthPct: block.widthPct, align: block.align }] : [];

    case "storeInfo": {
      const f = block.fields;
      const out: Row[] = [];
      if (f.name) splitReceiptLines(store.storeName).forEach((l, i) => out.push(text(l, i === 0 ? at(block.nameStyle) : base)));
      if (f.address) splitReceiptLines(store.addressLine1, store.addressLine2).forEach((l) => out.push(text(l)));
      if (f.contact && store.contactNumber) out.push(text(`Contact: ${store.contactNumber}`));
      if (f.tin && store.tin) out.push(text(`TIN: ${store.tin}`));
      if (f.permit && store.permitNumber) out.push(text(`Permit: ${store.permitNumber}`));
      if (f.accreditation && store.accreditationNumber) out.push(text(`Accreditation: ${store.accreditationNumber}`));
      if (f.serial && store.serialNumberLabel) out.push(text(`Serial: ${store.serialNumberLabel}`));
      return out;
    }

    case "title": {
      // An empty title follows Settings › Receipt's title.
      const t = (block.text.trim() || store.receiptTitle || "").trim();
      return t ? [text(block.uppercase ? t.toUpperCase() : t)] : [];
    }

    case "saleDetails": {
      const out: Row[] = [];
      for (const field of block.fields) {
        if (!field.visible) continue;
        const value =
          field.key === "receiptNo"
            ? data.saleNumber
            : field.key === "date"
            ? data.date.toLocaleDateString("en-PH")
            : field.key === "time"
            ? data.date.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit", hour12: true })
            : field.key === "cashier"
            ? fullName(data.cashier)
            : field.key === "customer"
            ? data.customer
              ? fullName(data.customer)
              : null
            : data.branchName ?? null;
        if (value) out.push(pair(field.label, value));
      }
      return out;
    }

    case "items": {
      const out: Row[] = [];
      const fmt = block.itemFormat;
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
            const cells = line.cells.map((c) => ({ text: itemCellText(c, item), width: c.width, align: c.align }));
            if (cells.every((c) => c.text === "")) continue; // e.g. a generic-name line for an item without one
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
        const amount = `${peso(item.totalPrice)}${block.showVatMarker ? ` ${item.isVatable ? "V" : "N"}` : ""}`;
        out.push({ kind: "pair", left: `${item.quantity} x ${peso(item.unitPrice)}`, right: amount, style: base, tight: true });
      }
      if (block.showItemCount) {
        if (block.countRule) out.push({ kind: "rule", char: "-", style: base });
        const count = block.countMode === "pieces" ? pieces(data) : data.items.length;
        out.push(text(`${block.itemCountLabel} ${count}`, base, "left"));
      }
      return out;
    }

    case "field":
      return fieldRows(block, block.align, base, data);

    case "formula":
      return formulaRows(block, block.align, base, data);

    case "row": {
      const cells = block.cells.map((c) => ({ c, text: rowCellText(c, data) }));
      // Nothing to show when every value in the row is missing for this sale.
      if (cells.every(({ c, text }) => c.kind !== "text" && text === null) || cells.length === 0) return [];
      return [{ kind: "columns", cells: cells.map(({ c, text }) => ({ text: text ?? "", width: c.width, align: c.align })), gap: block.gap, style: base }];
    }

    case "totals":
      return block.lines.filter((line) => conditionHolds(line.showWhen, data)).flatMap((line) => totalsLineRows(line, data, base, at));

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
      if (block.showPointsPaid) loyalty.payment.forEach(([l, v]) => out.push(pair(l, v)));
      const method = loyalty.paidWithPointsOnly ? "LOYALTY POINTS" : formatPaymentMethodLabel(data.paymentMethod, data.paymentProvider);
      if (block.showMethod) out.push(block.methodAsPair ? pair("Payment:", method) : text(`Payment: ${method}`, base, "left"));
      if (block.showReference && data.paymentReference)
        out.push(block.methodAsPair ? pair("Ref No:", data.paymentReference) : text(`Ref No: ${data.paymentReference}`, base, "left"));
      if (block.showCash && data.cashReceived) out.push(pair("Cash:", peso(data.cashReceived)));
      if (block.showChange && data.changeGiven && data.changeGiven > 0) out.push(pair("Change:", peso(data.changeGiven)));
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
      return [...(block.heading.trim() ? [text(block.heading, at(block.headingStyle), "left")] : []), text(remarks, base, "left")];
    }

    case "text":
      return block.text.trim() ? [text(block.text)] : [];

    case "qr":
      if (!block.content.trim()) return [];
      return [
        { kind: "qr", content: block.content.trim(), sizePct: block.sizePct, align: block.align },
        ...(block.caption.trim() ? [text(block.caption)] : []),
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
  at: (...extra: (Style | undefined)[]) => ResolvedStyle
): Row[] {
  switch (line.kind) {
    case "computation":
      return buildComputationLines(data).map((l) => ({
        kind: "pair" as const,
        left: `${l.label}:`,
        right: `${l.kind === "subtotal" ? "= " : ""}${peso(l.amount)}`,
        // Same emphasis as today's receipt: the starting figure, running totals and savings in bold.
        style: at(line.style, l.kind === "base" || l.kind === "subtotal" || l.kind === "savings" ? { bold: true } : undefined),
      }));
    case "heading":
      return line.text.trim() ? [{ kind: "text", text: line.text, align: line.align, style: at(line.style) }] : [];
    case "rule":
      return [{ kind: "rule", char: line.char, style: base }];
    case "value":
      return fieldRows(line, line.align ?? "left", at(line.style), data);
    case "formula":
      return formulaRows(line, line.align ?? "left", at(line.style), data);
  }
}

// An owner's formula, laid out like a value.
function formulaRows(
  f: { label: string; expr: string; format: FormulaFormat; decimals: number; layout?: FieldLayout; minus: boolean; hideWhenZero: boolean },
  align: Align,
  style: ResolvedStyle,
  data: ReceiptData
): Row[] {
  const r = formulaText(f.expr, f.format, f.decimals, f.minus, data);
  if (!r) return [];
  if (f.hideWhenZero && Math.abs(r.value) < 0.005) return [];
  return placeValue(fillLabel(f.label, data), r.text, f.layout ?? "pair", align, style);
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
  data: ReceiptData
): Row[] {
  const field = TOTALS_FIELDS[f.key];
  if (!field) return [];
  const value = field.value(data);
  if (value === null || value === "") return [];
  if (typeof value === "number" && f.hideWhenZero && Math.abs(value) < 0.005) return [];
  const shown = field.format === "money" ? peso(f.minus ? -Math.abs(value as number) : (value as number)) : String(value);
  return placeValue(fillLabel(f.label, data), shown, f.layout ?? "pair", align, style);
}
