import type { Block, BlockType, Condition, FieldLayout, ItemCell, ItemField, ItemFormat, RowCell, RuleChar, SaleDetailField, StoreLabels, Style, TotalsKey, TotalsLine } from "./types";
import { TOTALS_FIELDS } from "./totals";
import { DEFAULT_VAT_CODES } from "./format";

let counter = 0;
// Unique enough within one design; the designer replaces these with UUIDs.
export const newId = (prefix = "b") =>
  `${prefix}${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const base = (id: string) => ({
  id,
  visible: true,
  align: "left" as const,
  style: {},
  spaceBefore: 0,
  spaceAfter: 0,
  ruleBefore: null,
  ruleAfter: null,
});

export const DEFAULT_SALE_DETAILS: SaleDetailField[] = [
  { key: "receiptNo", visible: true, label: "AR No:" },
  { key: "date", visible: true, label: "Date:" },
  { key: "cashier", visible: true, label: "Cashier:" },
  { key: "time", visible: true, label: "Time:" },
  { key: "customer", visible: true, label: "Customer:" },
  { key: "branch", visible: false, label: "Branch:" },
];

export const BLOCK_LABELS: Record<BlockType, string> = {
  logo: "Logo",
  storeInfo: "Store info",
  title: "Title",
  saleDetails: "Sale details",
  items: "Items",
  totals: "Totals",
  scPwd: "SC/PWD info",
  payment: "Payment",
  loyalty: "Loyalty points",
  remarks: "Remarks",
  text: "Custom text",
  qr: "QR code",
  barcode: "Barcode",
  rule: "Divider",
  footer: "Footer",
  field: "Field",
  row: "Row (side by side)",
  formula: "Formula",
};

export const newRowCell = (overrides: Partial<RowCell> = {}): RowCell => ({
  id: newId("c"),
  kind: "field",
  key: "date",
  text: "",
  expr: "total / 1.12",
  format: "money",
  decimals: 2,
  label: "",
  width: 0,
  align: "left",
  minus: false,
  ...overrides,
});

export const newItemCell = (field: ItemField, overrides: Partial<ItemCell> = {}): ItemCell => ({
  id: newId("i"),
  field,
  text: "",
  title: ITEM_FIELD_TITLES[field],
  width: 0,
  align: ["name", "generic", "barcode", "text", "dosage", "lot", "expiry", "lotExpiry"].includes(field) ? "left" : "right",
  ...overrides,
});

export const ITEM_FIELD_NAMES: Record<ItemField, string> = {
  name: "Product name",
  generic: "Generic name",
  barcode: "Barcode",
  qty: "Quantity",
  unitPrice: "Unit price",
  total: "Line total",
  vat: "VAT code (V / N, or your own letters)",
  totalVat: "Line total + VAT code (312.50X)",
  qtyXPrice: "Qty × price (2 x ₱6.50)",
  qtyAtPrice: "Qty @ price (2 @ ₱6.50)",
  dosage: "Dosage / directions (Rx)",
  lot: "Lot / batch no.",
  expiry: "Expiry date",
  lotExpiry: "Lot + expiry (A123 exp 03/31/2027)",
  text: "Text",
};
const ITEM_FIELD_TITLES: Record<ItemField, string> = {
  name: "ITEM",
  generic: "GENERIC",
  barcode: "BARCODE",
  qty: "QTY",
  unitPrice: "PRICE",
  total: "AMOUNT",
  vat: "",
  totalVat: "AMOUNT",
  qtyXPrice: "QTY x PRICE",
  qtyAtPrice: "QTY @ PRICE",
  dosage: "DIRECTIONS",
  lot: "LOT",
  expiry: "EXP",
  lotExpiry: "LOT / EXP",
  text: "",
};

export const DEFAULT_STORE_LABELS: StoreLabels = {
  contact: "Contact: ",
  tin: "TIN: ",
  permit: "Permit: ",
  accreditation: "Accreditation: ",
  serial: "Serial: ",
};

// Ready-made item layouts; owners can change every column afterwards.
export const ITEM_FORMATS: { key: string; label: string; make: () => ItemFormat }[] = [
  {
    key: "twoLine",
    label: "Two lines: name, then qty × price … amount",
    make: () => ({
      lines: [
        { id: newId("l"), style: { bold: true }, cells: [newItemCell("name")] },
        { id: newId("l"), style: {}, cells: [newItemCell("qtyXPrice"), newItemCell("total"), newItemCell("vat", { width: 6 })] },
      ],
    }),
  },
  {
    key: "oneLine",
    label: "One line: qty · name · amount",
    make: () => ({
      // Auto widths: qty and amount keep their size, the name takes the rest and wraps.
      lines: [{ id: newId("l"), style: {}, cells: [newItemCell("qty", { align: "left" }), newItemCell("name"), newItemCell("total")] }],
    }),
  },
  {
    key: "table",
    label: "Table: item | qty | price | amount",
    make: () => ({
      lines: [
        {
          id: newId("l"),
          style: {},
          cells: [newItemCell("name"), newItemCell("qty"), newItemCell("unitPrice"), newItemCell("total")],
        },
      ],
    }),
  },
  {
    key: "pharmacy",
    label: "Pharmacy: name, qty × price … amount, lot & expiry, directions",
    make: () => ({
      // The lot and directions lines print only for items that have them.
      lines: [
        { id: newId("l"), style: { bold: true }, cells: [newItemCell("name")] },
        { id: newId("l"), style: {}, cells: [newItemCell("qtyXPrice"), newItemCell("total"), newItemCell("vat", { width: 6 })] },
        { id: newId("l"), style: { font: "B" }, cells: [newItemCell("text", { text: "  Lot", width: 18 }), newItemCell("lotExpiry")] },
        { id: newId("l"), style: { font: "B" }, cells: [newItemCell("text", { text: "  Sig:", width: 18 }), newItemCell("dosage")] },
      ],
    }),
  },
];

// Groups that can be split into separate elements.
export const CAN_BREAK_APART: BlockType[] = ["totals", "saleDetails", "payment", "loyalty", "items"];

export const valueLine = (key: TotalsKey, overrides: Partial<Extract<TotalsLine, { kind: "value" }>> = {}): TotalsLine => ({
  id: newId("t"),
  kind: "value",
  key,
  label: TOTALS_FIELDS[key].label,
  style: {},
  minus: false,
  hideWhenZero: false,
  ...overrides,
});

// A single value as its own element.
export const newField = (
  key: TotalsKey,
  overrides: Partial<Extract<Block, { type: "field" }>> = {},
  id = newId()
): Extract<Block, { type: "field" }> => ({
  ...(newBlock("field", id) as Extract<Block, { type: "field" }>),
  key,
  label: TOTALS_FIELDS[key].label,
  ...overrides,
});

const merge = (...styles: (Style | undefined)[]): Style => Object.assign({}, ...styles.filter(Boolean));

// Splits a group into separate elements that print the same, so each can be
// moved anywhere. The group's own dividers/spacing become elements around them.
export function breakApart(block: Block, makeId: () => string = () => newId()): Block[] {
  const field = (key: TotalsKey, label: string, layout: FieldLayout, extra: Partial<Extract<Block, { type: "field" }>> = {}) =>
    newField(key, { label, layout, align: "left", style: { ...block.style }, ...extra }, makeId());
  const rule = (char: RuleChar): Block => ({ ...newBlock("rule", makeId()), style: { ...block.style }, char } as Block);
  const blank = (n: number): Block[] => (n > 0 ? [{ ...newBlock("rule", makeId()), char: " ", spaceAfter: n - 1 } as Block] : []);

  let parts: Block[];
  switch (block.type) {
    case "totals":
      parts = block.lines.map((l): Block => {
        if (l.kind === "value")
          return field(l.key, l.label, l.layout ?? "pair", {
            minus: l.minus,
            hideWhenZero: l.hideWhenZero,
            align: l.align ?? "left",
            style: merge(block.style, l.style),
          });
        if (l.kind === "formula")
          return {
            ...newBlock("formula", makeId()),
            label: l.label,
            expr: l.expr,
            format: l.format,
            decimals: l.decimals,
            layout: l.layout ?? "pair",
            minus: l.minus,
            hideWhenZero: l.hideWhenZero,
            align: l.align ?? "left",
            style: merge(block.style, l.style),
          } as Block;
        if (l.kind === "heading") return { ...newBlock("text", makeId()), text: l.text, align: l.align, style: merge(block.style, l.style) } as Block;
        if (l.kind === "rule") return rule(l.char);
        // The step-by-step computation stays one element: its lines change with the discount used.
        return { ...newBlock("totals", makeId()), style: { ...block.style }, lines: [{ ...l, id: newId("t") }] } as Block;
      });
      break;
    case "saleDetails":
      parts = block.fields.filter((f) => f.visible).map((f) => field(f.key, f.label, "pair"));
      break;
    case "payment":
      parts = [
        ...(block.showPointsPaid
          ? [field("pointsUsed", "Points used ({points}):", "pair", { minus: true }), field("amountPaid", "Amount paid:", "pair")]
          : []),
        ...(block.showMethod ? [field("paymentMethod", "Payment:", block.methodAsPair ? "pair" : "inline")] : []),
        ...(block.showReference ? [field("ewalletRef", "Ref No:", block.methodAsPair ? "pair" : "inline")] : []),
        ...(block.showCash ? [field("cash", "Cash:", "pair", { hideWhenZero: true })] : []),
        ...(block.showChange ? [field("change", "Change:", "pair", { hideWhenZero: true })] : []),
        ...(block.showPointsEarned ? [field("pointsEarned", "Points earned:", "pair")] : []),
        ...(block.showPointsBalance ? [field("pointsBalance", "Points balance:", "pair")] : []),
      ];
      break;
    case "loyalty":
      parts = [
        ...(block.showEarned ? [field("pointsEarned", "Points earned:", "pair")] : []),
        ...(block.showBalance ? [field("pointsBalance", "Points balance:", "pair")] : []),
      ];
      break;
    case "items":
      // The item list stays; its count line becomes its own element.
      if (!block.showItemCount) return [block];
      parts = [
        { ...block, id: makeId(), showItemCount: false, countRule: false, ruleBefore: null, ruleAfter: null, spaceBefore: 0, spaceAfter: 0 },
        ...(block.countRule ? [rule("-")] : []),
        field(block.countMode === "pieces" ? "quantity" : "itemCount", block.itemCountLabel, "inline"),
      ];
      break;
    default:
      return [block];
  }
  // Line conditions (Totals) were carried onto their parts above; the group's own applies to all.
  const lineConds = block.type === "totals" ? block.lines.map((l) => l.showWhen) : [];
  return [
    ...blank(block.spaceBefore),
    ...(block.ruleBefore ? [rule(block.ruleBefore)] : []),
    ...parts.map((p, i) => {
      const showWhen = bothConditions(block.showWhen, lineConds[i]);
      return { ...p, ...(block.visible ? {} : { visible: false }), ...(showWhen ? { showWhen } : {}) } as Block;
    }),
    ...(block.ruleAfter ? [rule(block.ruleAfter)] : []),
    ...blank(block.spaceAfter),
  ].map((p) => (block.showWhen && !p.showWhen ? ({ ...p, showWhen: block.showWhen } as Block) : p));
}

// Both conditions must hold.
export function bothConditions(a?: Condition, b?: Condition): Condition | undefined {
  if (!a) return b;
  if (!b) return a;
  const branches = a.branches?.length && b.branches?.length ? a.branches.filter((x) => b.branches!.includes(x)) : a.branches?.length ? a.branches : b.branches;
  return {
    saleTypes: [...new Set([...(a.saleTypes ?? []), ...(b.saleTypes ?? [])])],
    minTotal: a.minTotal != null && b.minTotal != null ? Math.max(a.minTotal, b.minTotal) : a.minTotal ?? b.minTotal ?? null,
    maxTotal: a.maxTotal != null && b.maxTotal != null ? Math.min(a.maxTotal, b.maxTotal) : a.maxTotal ?? b.maxTotal ?? null,
    fromDate: a.fromDate && b.fromDate ? (a.fromDate > b.fromDate ? a.fromDate : b.fromDate) : a.fromDate ?? b.fromDate ?? null,
    toDate: a.toDate && b.toDate ? (a.toDate < b.toDate ? a.toDate : b.toDate) : a.toDate ?? b.toDate ?? null,
    branches: branches ?? [],
  };
}

// A new block of each type, as added from the designer's palette.
export function newBlock(type: BlockType, id = newId()): Block {
  const b = base(id);
  switch (type) {
    case "logo":
      return { ...b, type, align: "center", widthPct: 60 };
    case "storeInfo":
      return {
        ...b,
        type,
        align: "center",
        fields: { name: true, address: true, contact: true, tin: true, permit: true, accreditation: true, serial: true },
        labels: { ...DEFAULT_STORE_LABELS },
        nameStyle: { bold: true },
      };
    case "title":
      return { ...b, type, align: "center", style: { bold: true }, text: "", uppercase: true };
    case "saleDetails":
      return { ...b, type, fields: DEFAULT_SALE_DETAILS.map((f) => ({ ...f })) };
    case "items":
      return {
        ...b,
        type,
        header: true,
        headerRule: true,
        countRule: true,
        headerLeft: "QTY ITEM",
        headerRight: "AMOUNT",
        headerStyle: { bold: true },
        nameStyle: { bold: true },
        showVatMarker: true,
        showGenericName: false,
        showItemCount: true,
        itemCountLabel: "Total Items:",
        countMode: "pieces",
        itemFormat: null,
        vatCodes: { ...DEFAULT_VAT_CODES },
      };
    case "row":
      return {
        ...b,
        type,
        gap: 1,
        cells: [newRowCell({ key: "date", label: "Date:" }), newRowCell({ key: "time", align: "right" })],
      };
    case "formula":
      return {
        ...b,
        type,
        label: "VAT-exclusive total:",
        expr: "total / 1.12",
        format: "money",
        decimals: 2,
        layout: "pair",
        minus: false,
        hideWhenZero: false,
      };
    case "field":
      return { ...b, type, key: "grossTotal", label: TOTALS_FIELDS.grossTotal.label, layout: "pair", minus: false, hideWhenZero: false };
    case "totals":
      return {
        ...b,
        type,
        lines: [
          { id: newId("t"), kind: "computation", style: {} },
          { id: newId("t"), kind: "rule", char: "=" },
          valueLine("totalDue", { style: { bold: true } }),
          { id: newId("t"), kind: "rule", char: "=" },
        ],
      };
    case "scPwd":
      return { ...b, type, titleStyle: { bold: true }, ruleAfter: "-" };
    case "payment":
      return {
        ...b,
        type,
        showPointsPaid: true,
        showMethod: true,
        showReference: true,
        showCash: true,
        showChange: true,
        showPointsEarned: true,
        showPointsBalance: true,
        methodAsPair: false,
      };
    case "loyalty":
      return { ...b, type, showEarned: true, showBalance: true };
    case "remarks":
      return { ...b, type, heading: "DOSAGE / INSTRUCTIONS:", headingStyle: { bold: true }, ruleAfter: "-" };
    case "text":
      return { ...b, type, align: "center", text: "Thank you, come again!" };
    case "qr":
      return { ...b, type, align: "center", content: "", sizePct: 50, caption: "" };
    case "barcode":
      return { ...b, type, align: "center", height: 60, showText: true };
    case "rule":
      return { ...b, type, char: "-" };
    case "footer":
      return { ...b, type, align: "center", noticeFirst: true };
  }
}
