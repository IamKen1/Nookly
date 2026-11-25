// Guided setup: simple answers → a complete design. The style picked first only
// sets the starting answers; every later step can change them.
import type { ReceiptStoreSettings } from "@/types/receipt";
import type { Block, BlockType, DateFormat, NameFormat, PaperWidth, PrintMode, SaleDetailKey, StoreField, Template, TimeFormat, TotalsKey, TotalsLine, VatCodes } from "./types";
import { TEMPLATE_VERSION } from "./types";
import { DEFAULT_SALE_DETAILS, DEFAULT_STORE_LABELS, ITEM_FORMATS, newBlock, newField, newId, valueLine } from "./blocks";
import { DEFAULT_VAT_CODES } from "./format";
import { computationAsLines, valueLineAsFormula } from "./explain";
import { REGISTER_LABELS, registerItems, registerScBlocks, registerTotalsLines, vatSummary } from "./presets";

export type WizardStyle = "classic" | "chain" | "register" | "compact" | "promo";
export type WizardItems = "standard" | "twoLine" | "oneLine" | "table" | "register" | "pharmacy";
export type WizardTotals = "steps" | "simple" | "register";
export type WizardCount = "none" | "line" | "stars";
export type WizardLetters = "VN" | "TX" | "none";

export interface WizardAnswers {
  style: WizardStyle;
  // paper & look
  paperWidth: PaperWidth;
  printMode: PrintMode;
  allCaps: boolean;
  // header
  showLogo: boolean;
  storeFields: Record<Exclude<StoreField, "name">, boolean>;
  labels: "plain" | "register"; // "TIN: " or "VAT REG TIN:"
  bigName: boolean;
  showTitle: boolean;
  // sale details
  details: Record<Exclude<SaleDetailKey, "branch">, boolean>;
  date: DateFormat;
  time: TimeFormat;
  cashierName: NameFormat;
  // items
  items: WizardItems;
  itemCount: WizardCount;
  letters: WizardLetters;
  codes?: VatCodes; // the letters typed in, instead of the preset's
  // totals & money
  peso: boolean;
  totals: WizardTotals;
  bigTotal: boolean;
  splitSteps?: boolean; // step by step as separate lines, each changeable
  formulas?: Partial<Record<TotalsKey, string>>; // a totals line's own computation instead of the saved figure
  // extras
  vatSummary: boolean;
  barcode: boolean;
  qrLink: string; // empty = none
  promoText: string; // empty = none
  message: string; // empty = none
}

export const WIZARD_STYLES: { key: WizardStyle; label: string; description: string }[] = [
  { key: "classic", label: "Simple & clear", description: "Nookly's standard receipt. A safe start." },
  { key: "register", label: "Big-chain register", description: "No ₱ sign, barcode per item, VAT summary." },
  { key: "chain", label: "Modern drugstore", description: "Logo, big total, barcode." },
  { key: "compact", label: "Paper saver", description: "Fewest lines." },
  { key: "promo", label: "With promo", description: "Promo banner and a QR code." },
];

export const WIZARD_ITEMS: { key: WizardItems; label: string; example: string }[] = [
  { key: "standard", label: "Name, then qty × price", example: "Biogesic 500mg\n2 x ₱6.50      ₱13.00 V" },
  { key: "oneLine", label: "All on one line", example: "2  Biogesic 500mg   ₱13.00" },
  { key: "table", label: "Table with columns", example: "ITEM       QTY PRICE AMOUNT\nBiogesic     2  6.50  13.00" },
  { key: "register", label: "Barcode and qty @ price", example: "BIOGESIC 500MG       13.00T\n    4800010012345  2 @ 6.50" },
  {
    key: "pharmacy",
    label: "With lot, expiry and directions",
    example: "Losartan 50mg\n30 x ₱12.00    ₱360.00 V\n  Lot  LS0921 exp 12/15/2026\n  Sig: 1 tablet once a day",
  },
];

export const WIZARD_TOTALS: { key: WizardTotals; label: string; example: string }[] = [
  {
    key: "steps",
    label: "Step by step (like today)",
    example: "VATable Sales:       ₱373.00\nLess: VAT (12%):     -₱39.96\nNet VATable Sales: = ₱333.04\nTOTAL AMOUNT DUE:    ₱405.50",
  },
  { key: "simple", label: "Short and simple", example: "Subtotal:            ₱405.50\nLess: Discount:       -₱0.00\nTOTAL:               ₱405.50" },
  {
    key: "register",
    label: "Register style, with amount tendered",
    example: "Amt of VAT EXEMPT ITEMS  32.50\nAmt of Sale With VAT    373.00\nTOTAL AMOUNT            405.50\nCASH                    500.00\nCHANGE                   94.50",
  },
];

const ALL_STORE = { address: true, contact: true, tin: true, permit: true, accreditation: true, serial: true };
const ALL_DETAILS = { receiptNo: true, date: true, time: true, cashier: true, customer: true };

// What each style starts with.
export function answersFor(style: WizardStyle, paperWidth: PaperWidth = 58): WizardAnswers {
  const base: WizardAnswers = {
    style,
    paperWidth,
    printMode: "TEXT",
    allCaps: false,
    showLogo: false,
    storeFields: { ...ALL_STORE },
    labels: "plain",
    bigName: false,
    showTitle: true,
    details: { ...ALL_DETAILS },
    date: "default",
    time: "default",
    cashierName: "full",
    items: "standard",
    itemCount: "line",
    letters: "VN",
    peso: true,
    totals: "steps",
    bigTotal: false,
    vatSummary: false,
    barcode: false,
    qrLink: "",
    promoText: "",
    message: "",
  };
  switch (style) {
    case "register":
      return {
        ...base,
        storeFields: { ...ALL_STORE, permit: false, accreditation: false },
        labels: "register",
        showTitle: false,
        details: { receiptNo: true, date: true, time: true, cashier: true, customer: false },
        date: "MM-DD-YY",
        time: "h:mmA",
        cashierName: "first",
        items: "register",
        itemCount: "stars",
        letters: "TX",
        peso: false,
        totals: "register",
        vatSummary: true,
      };
    case "chain":
      return { ...base, showLogo: true, bigName: true, totals: "simple", bigTotal: true, barcode: true, vatSummary: true };
    case "compact":
      return {
        ...base,
        storeFields: { address: true, contact: false, tin: true, permit: false, accreditation: false, serial: false },
        details: { receiptNo: true, date: true, time: true, cashier: false, customer: false },
        items: "oneLine",
        itemCount: "none",
        letters: "none",
        totals: "simple",
      };
    case "promo":
      return { ...base, promoText: "PROMO OF THE MONTH", qrLink: "https://", bigTotal: true };
    default:
      return base;
  }
}

const make = <T extends BlockType>(type: T, changes: Partial<Extract<Block, { type: T }>> = {}) => ({ ...newBlock(type), ...changes }) as Extract<Block, { type: T }>;
const rule = (char: "-" | "=" = "-") => make("rule", { char });
const lineRule = (char: "-" | "=" = "-"): TotalsLine => ({ id: newId("t"), kind: "rule", char });

function itemsBlock(a: WizardAnswers): Block {
  const codes = a.codes ? { ...a.codes } : presetCodes(a.letters);
  if (a.items === "register") {
    const b = registerItems();
    const withCodes = { ...b, vatCodes: codes, showItemCount: a.itemCount === "line" };
    // No letters: the amount alone.
    return a.letters === "none"
      ? { ...withCodes, itemFormat: withCodes.itemFormat && { lines: withCodes.itemFormat.lines.map((l) => ({ ...l, cells: l.cells.map((c) => (c.field === "totalVat" ? { ...c, field: "total" as const } : c)) })) } }
      : withCodes;
  }
  const base = make("items", {
    header: a.items === "table",
    showVatMarker: a.letters !== "none",
    vatCodes: codes,
    showItemCount: a.itemCount === "line",
    countMode: "pieces",
  });
  if (a.items === "standard") return base;
  const fmt = ITEM_FORMATS.find((f) => f.key === a.items)!.make();
  // The two-line format carries its own V/N column.
  if (a.letters === "none") fmt.lines = fmt.lines.map((l) => ({ ...l, cells: l.cells.filter((c) => c.field !== "vat") }));
  return { ...base, itemFormat: fmt };
}

// The letters each preset prints: [item with VAT, same item on a Senior/PWD sale, non-VAT product].
export const presetCodes = (letters: WizardLetters): VatCodes => (letters === "TX" ? { vatable: "T", exempt: "X", nonVat: "X" } : { ...DEFAULT_VAT_CODES });

// Value lines whose computation the owner changed in the wizard become formula lines.
const withFormulas = (lines: TotalsLine[], a: WizardAnswers): TotalsLine[] =>
  lines.map((l) => (l.kind === "value" && a.formulas?.[l.key] ? valueLineAsFormula(l, a.formulas[l.key]!) : l));

function totalsBlocks(a: WizardAnswers): Block[] {
  return totalsBlocksStandard(a).map((b) => (b.type === "totals" ? { ...b, lines: withFormulas(b.lines, a) } : b));
}

function totalsBlocksStandard(a: WizardAnswers): Block[] {
  const big = a.bigTotal ? { bold: true, sizeH: 2 } : { bold: true };
  // The owner's price formula and cash rounding print only on sales they changed.
  const adjustments = [valueLine("adjustment", { label: "{adjustmentLabel}:" }), valueLine("rounding", { label: "Rounding:" })];
  if (a.totals === "register") {
    const lines = registerTotalsLines();
    const i = lines.findIndex((l) => l.kind === "value" && l.key === "totalDue");
    lines.splice(i, 0, ...adjustments);
    return [make("totals", { lines })];
  }
  if (a.totals === "simple") {
    return [
      make("totals", {
        lines: [
          valueLine("grossTotal", { label: "Subtotal:" }),
          valueLine("discount", { label: "Less: {discountName} ({discountRate}):", minus: true, hideWhenZero: true }),
          valueLine("vatRemoved", { minus: true, hideWhenZero: true }),
          ...adjustments,
          lineRule("="),
          valueLine("totalDue", { label: "TOTAL:", style: big }),
          lineRule("="),
        ],
      }),
      make("payment", { ruleAfter: "-" }),
    ];
  }
  return [
    make("totals", {
      lines: [
        ...(a.splitSteps ? computationAsLines() : [{ id: newId("t"), kind: "computation" as const, style: {} }]),
        lineRule("="),
        valueLine("totalDue", { style: big }),
        lineRule("="),
      ],
    }),
    make("payment", { ruleAfter: "-" }),
  ];
}

export function buildFromAnswers(a: WizardAnswers, settings: ReceiptStoreSettings): Template {
  const register = a.totals === "register";
  const blocks: Block[] = [];

  // header
  if (a.showLogo) blocks.push(make("logo"));
  blocks.push(
    make("storeInfo", {
      fields: { name: true, ...a.storeFields },
      labels: a.labels === "register" ? { ...REGISTER_LABELS } : { ...DEFAULT_STORE_LABELS },
      nameStyle: a.bigName ? { bold: true, sizeW: 2, sizeH: 2 } : { bold: true },
    })
  );
  if (a.showTitle) blocks.push(make("title"));
  blocks.push(rule());

  // sale details: a register receipt has the cashier on top and the AR number and date at the bottom
  if (register) {
    if (a.details.cashier) blocks.push(newField("cashier", { label: "CASHIER:", layout: "inline", align: "left", style: { uppercase: true } }));
    if (a.details.customer) blocks.push(newField("customer", { label: "CUSTOMER:", layout: "inline", align: "left" }));
  } else {
    const details = make("saleDetails");
    details.fields = DEFAULT_SALE_DETAILS.map((f) => ({ ...f, visible: f.key === "branch" ? false : a.details[f.key] }));
    if (details.fields.some((f) => f.visible)) blocks.push(details, rule());
  }

  // items
  blocks.push(itemsBlock(a));
  if (a.itemCount === "stars") blocks.push(make("text", { text: "** {quantity} item(s) **", spaceAfter: 1 }));
  blocks.push(rule());

  // totals & payment
  blocks.push(...totalsBlocks(a));

  // SC/PWD (required on SC/PWD sales)
  if (register) blocks.push(...registerScBlocks(), rule());
  else blocks.push(make("scPwd"));
  blocks.push(make("loyalty"));
  blocks.push(make("remarks", { visible: settings.includeOrderRemarks }));

  // extras
  if (a.vatSummary) blocks.push(...(register ? [] : [rule()]), ...vatSummary(), rule());
  if (a.promoText.trim()) blocks.push(make("text", { text: a.promoText.trim(), style: { bold: true, sizeW: 2, sizeH: 2, inverse: true }, spaceBefore: 1 }));
  if (a.qrLink.trim()) blocks.push(make("qr", { content: a.qrLink.trim(), caption: "Scan me!" }));
  if (a.barcode) blocks.push(make("barcode"));
  if (a.message.trim()) blocks.push(make("text", { text: a.message.trim(), spaceBefore: 1 }));
  blocks.push(make("footer", { noticeFirst: false, spaceBefore: 1 }));
  if (register) {
    if (a.details.receiptNo) blocks.push(newField("receiptNo", { label: "AR #", layout: "inline", align: "left", spaceBefore: 1 }));
    const when = [a.details.date && "{date}", a.details.time && "{time}"].filter(Boolean).join(" ");
    if (when) blocks.push(make("text", { text: when, align: "left" }));
  }

  return {
    version: TEMPLATE_VERSION,
    paperWidth: a.paperWidth,
    printMode: a.printMode,
    theme: {
      style: a.allCaps ? { uppercase: true } : {},
      format: { currency: a.peso ? "peso" : "none", date: a.date, time: a.time, cashierName: a.cashierName, customerName: "full" },
    },
    blocks,
  };
}
