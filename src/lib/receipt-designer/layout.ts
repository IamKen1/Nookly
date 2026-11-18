import type { ReceiptData } from "@/types/receipt";
import { formatPaymentMethodLabel, NOT_BIR_ACCREDITED_NOTICE, splitReceiptLines } from "@/types/receipt";
import { buildComputationLines, isSeniorOrPwd, loyaltyLines, peso } from "@/lib/receipt";
import type { Align, Block, ResolvedStyle, RuleChar, Style, Template, TotalsLine } from "./types";
import { resolveStyle } from "./style";
import { TOTALS_FIELDS } from "./totals";

// A receipt as styled rows, before it's fitted to a paper width. Both the
// thermal output (textmode.ts) and the HTML output are made from these.
export type Row = RowBody & { blockId?: string }; // blockId: which block it came from (designer preview)

type RowBody =
  | { kind: "text"; text: string; align: Align; style: ResolvedStyle }
  // Label on the left, value on the right of the same line. `tight` keeps them
  // on one line however long (the item rows); otherwise a value that doesn't
  // fit moves to its own right-aligned line.
  | { kind: "pair"; left: string; right: string; style: ResolvedStyle; tight?: boolean }
  | { kind: "rule"; char: RuleChar; style: ResolvedStyle }
  | { kind: "feed"; lines: number; style: ResolvedStyle }
  | { kind: "image"; src: string; widthPct: number; align: Align }
  | { kind: "qr"; content: string; sizePct: number; align: Align }
  | { kind: "barcode"; content: string; height: number; showText: boolean; align: Align };

// Blank lines after the last row, so the receipt clears the cutter.
export const TAIL_FEED = 3;

const fullName = (p: { firstName: string; lastName: string }) => `${p.firstName} ${p.lastName}`;

export function layoutReceipt(template: Template, data: ReceiptData): Row[] {
  const theme = template.theme.style;
  const rows: Row[] = [];
  let noticePrinted = false;

  for (const block of template.blocks) {
    if (!block.visible) continue;
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
      if (block.header) {
        out.push(pair(block.headerLeft, block.headerRight, at(block.headerStyle)));
        if (block.headerRule) out.push({ kind: "rule", char: "-", style: base });
      }
      for (const item of data.items) {
        out.push(text(item.name, at(block.nameStyle), "left"));
        if (block.showGenericName && item.genericName) out.push(text(item.genericName, base, "left"));
        const amount = `${peso(item.totalPrice)}${block.showVatMarker ? ` ${item.isVatable ? "V" : "N"}` : ""}`;
        out.push({ kind: "pair", left: `${item.quantity} x ${peso(item.unitPrice)}`, right: amount, style: base, tight: true });
      }
      if (block.showItemCount) {
        if (block.countRule) out.push({ kind: "rule", char: "-", style: base });
        out.push(text(`${block.itemCountLabel} ${data.items.length}`, base, "left"));
      }
      return out;
    }

    case "totals":
      return block.lines.flatMap((line) => totalsLineRows(line, data, base, at));

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
    case "value": {
      const field = TOTALS_FIELDS[line.key];
      const value = field.value(data);
      if (value === null) return [];
      if (typeof value === "number" && line.hideWhenZero && Math.abs(value) < 0.005) return [];
      const shown =
        field.format === "money"
          ? peso(line.minus ? -Math.abs(value as number) : (value as number))
          : String(value);
      return [{ kind: "pair", left: line.label, right: shown, style: at(line.style) }];
    }
  }
}
