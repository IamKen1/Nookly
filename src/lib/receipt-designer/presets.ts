import type { ReceiptStoreSettings } from "@/types/receipt";
import type { Block, BlockType, Template, TotalsKey, TotalsLine } from "./types";
import { TEMPLATE_VERSION } from "./types";
import { newBlock, newField, newId, newItemCell, newRowCell, valueLine } from "./blocks";

type PresetKey = "classic" | "chain" | "register" | "compact" | "promo";

export const PRESETS: { key: PresetKey; label: string; description: string }[] = [
  { key: "classic", label: "Nookly Classic", description: "Your receipt today, block for block." },
  { key: "chain", label: "Chain drugstore", description: "VAT summary, V/N per item, barcode at the bottom." },
  {
    key: "register",
    label: "POS register",
    description: "Big-chain register style: no ₱ sign, barcode and qty @ price per item, T/X VAT letters, step-by-step SC/PWD lines, VAT summary.",
  },
  { key: "compact", label: "Compact", description: "Fewest lines, saves paper." },
  { key: "promo", label: "Promo", description: "Big promo text and a QR code." },
];

// Builds a block and applies changes to it, keeping its type-specific fields typed.
const make = <T extends BlockType>(type: T, changes: Partial<Extract<Block, { type: T }>> = {}) =>
  ({ ...newBlock(type), ...changes }) as Extract<Block, { type: T }>;

const rule = (char: "-" | "=" = "-") => make("rule", { char });
const lineRule = (char: "-" | "=" = "-"): TotalsLine => ({ id: newId("t"), kind: "rule", char });
const heading = (text: string): TotalsLine => ({ id: newId("t"), kind: "heading", text, align: "left", style: { bold: true } });

// Today's receipt, rebuilt from blocks. Follows Settings › Receipt the same
// way: cashier/customer names and remarks only when turned on there.
function classic(settings: ReceiptStoreSettings): Block[] {
  const details = make("saleDetails");
  details.fields = details.fields.map((f) =>
    f.key === "cashier" ? { ...f, visible: settings.showCashierName } : f.key === "customer" ? { ...f, visible: settings.showCustomerName } : f
  );
  return [
    make("storeInfo"),
    make("title"),
    rule(),
    details,
    rule(),
    // Today's receipt counts products (lines); owners can switch to pieces.
    make("items", { countMode: "products" }),
    rule(),
    make("totals"),
    make("scPwd"),
    make("payment", { ruleAfter: "-" }),
    make("remarks", { visible: settings.includeOrderRemarks }),
    make("footer"),
  ];
}

function chain(settings: ReceiptStoreSettings): Block[] {
  return [
    make("logo"),
    make("storeInfo"),
    make("title", { ruleAfter: "=" }),
    make("saleDetails", { ruleAfter: "-" }),
    make("items", { ruleAfter: "-" }),
    make("totals", {
      lines: [
        valueLine("grossTotal", { label: "Subtotal:" }),
        valueLine("discount", { minus: true, hideWhenZero: true }),
        valueLine("vatRemoved", { minus: true, hideWhenZero: true }),
        lineRule("="),
        valueLine("totalDue", { label: "TOTAL:", style: { bold: true, sizeH: 2 } }),
        lineRule("="),
        heading("VAT BREAKDOWN"),
        valueLine("vatableSales"),
        valueLine("vatExemptSales"),
        valueLine("zeroRatedSales"),
        valueLine("nonVatableSales"),
        valueLine("vatAmount"),
        lineRule("-"),
      ],
    }),
    make("scPwd"),
    make("payment", { ruleAfter: "-" }),
    make("remarks", { visible: settings.includeOrderRemarks }),
    make("barcode"),
    make("footer", { noticeFirst: false, spaceBefore: 1 }),
  ];
}

// The look of a big drugstore chain's register receipt, with the owner's own
// store details: every line in printer font A, values with no ₱ sign.
const SC_ONLY = { saleTypes: ["scpwd" as const] };
const blank = (): TotalsLine => ({ id: newId("t"), kind: "rule", char: " " });

// One line of the VAT summary: indented label, VAT letter, amount.
export const summaryRow = (label: string, letter: string, value: { key: TotalsKey } | { expr: string }) =>
  make("row", {
    gap: 0,
    cells: [
      newRowCell({ kind: "text", text: "", width: 6 }),
      newRowCell({ kind: "text", text: label, width: 52 }),
      newRowCell({ kind: "text", text: letter, width: 12 }),
      "key" in value
        ? newRowCell({ kind: "field", key: value.key, align: "right" })
        : newRowCell({ kind: "formula", expr: value.expr, format: "money", align: "right" }),
    ],
  });

// The VAT summary at the bottom of a register receipt.
export const vatSummary = (): Block[] => [
  summaryRow("VATable", "(T)", { key: "vatableSales" }),
  summaryRow("VAT-Exempt Sale", "(X)", { expr: "vatExempt + nonVatGross" }),
  summaryRow("Zero-Rated Sale", "(Z)", { key: "zeroRatedSales" }),
  summaryRow("VAT - 12%", "", { key: "vatAmount" }),
  summaryRow("Amount Due", "", { key: "totalDue" }),
];

// Item lines: name … amount+letter, then barcode and qty @ price.
export const registerItems = () =>
  make("items", {
    header: false,
    showItemCount: false,
    nameStyle: {},
    vatCodes: { vatable: "T", exempt: "X", nonVat: "X" },
    itemFormat: {
      lines: [
        { id: newId("l"), style: {}, cells: [newItemCell("name"), newItemCell("totalVat")] },
        {
          id: newId("l"),
          style: {},
          cells: [newItemCell("text", { width: 8 }), newItemCell("barcode", { width: 44 }), newItemCell("qtyAtPrice", { align: "left" })],
        },
      ],
    },
  });

// Register-style totals: step by step in plain words, then what was paid.
export const registerTotalsLines = (): TotalsLine[] => [
        valueLine("nonVatableGross", { label: "Amt of VAT EXEMPT ITEMS" }),
        valueLine("vatableGross", { label: "Amt of Sale With VAT" }),
        { ...valueLine("vatRemoved", { label: "Less 12% VAT" }), showWhen: SC_ONLY },
        {
          id: newId("t"),
          kind: "formula",
          label: "TOTAL AMOUNT w/o VAT",
          expr: "subtotal - vatRemoved",
          format: "money",
          decimals: 2,
          style: {},
          minus: false,
          hideWhenZero: false,
          showWhen: SC_ONLY,
        },
        valueLine("discount", { label: "LESS : {discountRate} {discountName}", hideWhenZero: true }),
        valueLine("totalDue", { label: "TOTAL AMOUNT" }),
        blank(),
        valueLine("totalDue", { label: "TOTAL" }),
        { id: newId("t"), kind: "heading", text: "AMOUNT TENDERED", align: "left", style: {}, showWhen: { saleTypes: ["sale"] } },
        valueLine("cash", { label: "CASH" }),
        { ...valueLine("ewalletRef", { label: "{paymentMethod} REF" }), showWhen: { saleTypes: ["ewallet"] } },
        blank(),
        blank(),
        { ...valueLine("cash", { label: "TOTAL PAYMENT" }), showWhen: { saleTypes: ["cash"] } },
        { ...valueLine("totalDue", { label: "TOTAL PAYMENT" }), showWhen: { saleTypes: ["ewallet"] } },
        valueLine("change", { label: "CHANGE" }),
];

// SC/PWD lines for a register receipt: ID, name, and lines to sign and fill in.
export const registerScBlocks = (): Block[] => {
  const sc = <T extends BlockType>(type: T, changes: Partial<Extract<Block, { type: T }>>) => make(type, { showWhen: SC_ONLY, ...changes });
  return [
    sc("field", { key: "discountIdNumber", label: "OSCA/PWD ID No.:", layout: "inline", align: "left" }),
    sc("field", { key: "discountHolder", label: "SOLD TO:", layout: "inline", align: "left", style: { uppercase: true } }),
    sc("text", { text: "SIGNATURE : __________________", align: "left" }),
    sc("text", { text: "ADDRESS   : __________________", align: "left" }),
    sc("text", { text: "TIN NO    : __________________", align: "left" }),
  ];
};

export const REGISTER_LABELS = { contact: "TEL NO : ", tin: "VAT REG TIN:", permit: "PERMIT NO: ", accreditation: "ACCRED NO: ", serial: "S/N: " };

function register(): Block[] {
  return [
    make("storeInfo", {
      nameStyle: {},
      fields: { name: true, address: true, contact: true, tin: true, permit: false, accreditation: false, serial: true },
      labels: { ...REGISTER_LABELS },
    }),
    newField("cashier", { label: "CASHIER:", layout: "inline", align: "left", style: { uppercase: true } }),
    registerItems(),
    make("totals", { lines: registerTotalsLines() }),
    make("text", { text: "**   {quantity} item(s)   **", align: "left", spaceAfter: 1 }),
    ...registerScBlocks(),
    rule(),
    ...vatSummary(),
    make("footer", { noticeFirst: false, ruleBefore: "-", ruleAfter: "-" }),
    make("field", { key: "receiptNo", label: "AR #", layout: "inline", align: "left", spaceBefore: 1 }),
    make("text", { text: "{date} {time} {cashier}", align: "left", style: { uppercase: true } }),
  ];
}

function compact(): Block[] {
  const details = make("saleDetails");
  details.fields = details.fields.map((f) => ({ ...f, visible: f.key === "receiptNo" || f.key === "date" || f.key === "time" }));
  return [
    make("storeInfo", {
      fields: { name: true, address: true, contact: false, tin: true, permit: false, accreditation: false, serial: false },
    }),
    details,
    rule(),
    make("items", { header: false, showVatMarker: false, showItemCount: false, nameStyle: {} }),
    rule(),
    make("totals", {
      lines: [
        valueLine("discount", { minus: true, hideWhenZero: true }),
        valueLine("vatRemoved", { minus: true, hideWhenZero: true }),
        valueLine("totalDue", { label: "TOTAL:", style: { bold: true } }),
        valueLine("vatAmount", { label: "VAT:", hideWhenZero: true }),
      ],
    }),
    make("scPwd"),
    make("payment", { methodAsPair: true, ruleAfter: "-" }),
    make("footer", { noticeFirst: false }),
  ];
}

function promo(settings: ReceiptStoreSettings): Block[] {
  return [
    ...classic(settings).filter((b) => b.type !== "footer"),
    make("text", { text: "PROMO OF THE MONTH", style: { bold: true, sizeW: 2, sizeH: 2, inverse: true } }),
    make("text", { text: "Ask our pharmacist about this month's deals!" }),
    make("qr", { content: "https://", caption: "Follow us for promos" }),
    make("footer", { noticeFirst: false, spaceBefore: 1 }),
  ];
}

export function buildPreset(key: PresetKey, settings: ReceiptStoreSettings, paperWidth: 58 | 80 = 58): Template {
  const blocks =
    key === "classic" ? classic(settings)
    : key === "chain" ? chain(settings)
    : key === "register" ? register()
    : key === "compact" ? compact()
    : promo(settings);
  const theme =
    key === "register"
      ? { style: {}, format: { currency: "none" as const, date: "MM-DD-YY" as const, time: "h:mmA" as const, cashierName: "first" as const, customerName: "full" as const } }
      : { style: {} };
  return { version: TEMPLATE_VERSION, paperWidth, printMode: "TEXT", theme, blocks };
}
