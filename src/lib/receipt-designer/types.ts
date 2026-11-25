// The receipt designer's saved format. A design is a list of blocks printed
// top to bottom; every figure comes from the saved sale (ReceiptData), so a
// design changes how a receipt looks, never what it adds up to.
//
// Stored in ReceiptTemplate.blocks / theme as JSON. Bump TEMPLATE_VERSION and
// add an upgrade step in validate.ts whenever this format changes.

export const TEMPLATE_VERSION = 1;

export type PaperWidth = 58 | 80;
export type PrintMode = "TEXT" | "IMAGE";
export type Align = "left" | "center" | "right";
export type RuleChar = "-" | "=" | "." | "*" | " ";

// How text looks. Unset fields inherit: theme → block → totals line.
// TEXT mode prints with the printer's own fonts (font, sizeW, sizeH, bold,
// underline, inverse). IMAGE mode and the browser print use the rest too.
export interface Style {
  font?: "A" | "B"; // printer font: A normal, B small
  sizeW?: number; // 1–8 × width (text mode)
  sizeH?: number; // 1–8 × height (text mode)
  fontFamily?: string; // image mode / browser: a key of IMAGE_FONTS
  fontSize?: number; // pt, image mode / browser
  bold?: boolean;
  italic?: boolean; // image mode / browser only
  underline?: boolean;
  inverse?: boolean; // white on black
  color?: string; // #rrggbb; browser in color, image mode in gray, text mode black
  background?: string | null;
  lineHeight?: number; // × font size
  letterSpacing?: number; // px, image mode / browser
  uppercase?: boolean; // ALL CAPS, every mode
}

export type ResolvedStyle = Required<Omit<Style, "background">> & { background: string | null };

// Fonts offered in image mode, loaded from Google Fonts when printing.
export const IMAGE_FONTS: Record<string, { label: string; css: string; google?: string }> = {
  inter: { label: "Inter", css: "'Inter', Arial, sans-serif", google: "Inter:ital,wght@0,400;0,700;1,400;1,700" },
  roboto: { label: "Roboto", css: "'Roboto', Arial, sans-serif", google: "Roboto:ital,wght@0,400;0,700;1,400;1,700" },
  poppins: { label: "Poppins", css: "'Poppins', Arial, sans-serif", google: "Poppins:ital,wght@0,400;0,700;1,400;1,700" },
  montserrat: { label: "Montserrat", css: "'Montserrat', Arial, sans-serif", google: "Montserrat:ital,wght@0,400;0,700;1,400;1,700" },
  robotoMono: { label: "Roboto Mono", css: "'Roboto Mono', 'Courier New', monospace", google: "Roboto+Mono:ital,wght@0,400;0,700;1,400;1,700" },
  courierPrime: { label: "Courier Prime", css: "'Courier Prime', 'Courier New', monospace", google: "Courier+Prime:ital,wght@0,400;0,700;1,400;1,700" },
  playfair: { label: "Playfair Display", css: "'Playfair Display', Georgia, serif", google: "Playfair+Display:ital,wght@0,400;0,700;1,400;1,700" },
  pacifico: { label: "Pacifico", css: "'Pacifico', cursive", google: "Pacifico" },
  arial: { label: "Arial (built-in)", css: "Arial, Helvetica, sans-serif" },
  courier: { label: "Courier (built-in)", css: "'Courier New', Courier, monospace" },
};

// How values are written on the whole receipt. "default" keeps today's format.
export type DateFormat = "default" | "MM-DD-YY" | "MM/DD/YY" | "MM/DD/YYYY" | "YYYY-MM-DD" | "MMM D, YYYY";
export type TimeFormat = "default" | "h:mmA" | "hh:mm AM" | "HH:mm" | "HH:mm:ss";
export type NameFormat = "full" | "first" | "last" | "firstLastInitial" | "lastFirst";
export interface ValueFormat {
  currency: "peso" | "none"; // ₱312.50 or 312.50
  date: DateFormat;
  time: TimeFormat;
  cashierName: NameFormat;
  customerName: NameFormat;
}

export interface Theme {
  style: Style;
  format?: ValueFormat; // unset = today's formats
}

// "Show only when…": every condition set must hold for the element to print.
export type SaleType = "scpwd" | "discount" | "noDiscount" | "cash" | "ewallet" | "customer" | "points";
export interface Condition {
  saleTypes?: SaleType[];
  minTotal?: number | null; // total amount due at least
  maxTotal?: number | null; // at most
  fromDate?: string | null; // YYYY-MM-DD, Philippine date of the sale, inclusive
  toDate?: string | null;
  branches?: string[]; // store ids; empty = every branch
}

interface BlockBase {
  id: string;
  visible: boolean;
  align: Align;
  style: Style;
  spaceBefore: number; // blank lines
  spaceAfter: number;
  // A rule printed only when the block itself prints (e.g. after the SC/PWD box).
  ruleBefore: RuleChar | null;
  ruleAfter: RuleChar | null;
  showWhen?: Condition;
}

export type FormulaFormat = "money" | "number" | "percent" | "int";

// One column of a Row: a value, some text, or a formula.
export interface RowCell {
  id: string;
  kind: "field" | "text" | "formula";
  key: TotalsKey; // kind "field"
  text: string; // kind "text" (labels' {tokens} work here too)
  expr: string; // kind "formula"
  format: FormulaFormat; // kind "formula"
  decimals: number;
  label: string; // printed before the value ("Date: 11/19/2026"); empty = value only
  width: number; // % of the line; 0 = share what's left
  align: Align;
  minus: boolean;
}

// Item lines built from columns. null on an Items block = the standard two-line layout.
export type ItemField =
  | "name"
  | "generic"
  | "barcode"
  | "qty"
  | "unitPrice"
  | "total"
  | "vat"
  | "totalVat" // amount with the VAT code right after it: 312.50X
  | "qtyXPrice"
  | "qtyAtPrice" // 10 @ 31.25
  | "text";

// The letter printed for each item's VAT status (items block, "V / N" columns).
export interface VatCodes {
  vatable: string; // a VATable item on a regular sale
  exempt: string; // a VATable item made VAT-exempt by SC/PWD
  nonVat: string; // a non-VAT / VAT-exempt product
}
export interface ItemCell {
  id: string;
  field: ItemField;
  text: string; // field "text"
  title: string; // column header
  width: number; // % of the line; 0 = share what's left
  align: Align;
}
export interface ItemLine {
  id: string;
  cells: ItemCell[];
  style: Style;
}
export interface ItemFormat {
  lines: ItemLine[];
}

export type StoreField = "name" | "address" | "contact" | "tin" | "permit" | "accreditation" | "serial";
export type StoreLabels = Record<"contact" | "tin" | "permit" | "accreditation" | "serial", string>;
export type SaleDetailKey = "receiptNo" | "date" | "cashier" | "time" | "customer" | "branch";

export interface SaleDetailField {
  key: SaleDetailKey;
  visible: boolean;
  label: string;
}

// Every value a receipt can show (see totals.ts), all read from the saved
// sale. Each can be its own element anywhere, or a line inside a group.
export type TotalsKey =
  | "grossTotal"
  | "vatableGross"
  | "nonVatableGross"
  | "itemCount"
  | "quantity"
  | "discount"
  | "vatRemoved"
  | "totalSavings"
  | "vatableSales"
  | "vatExemptSales"
  | "zeroRatedSales"
  | "nonVatableSales"
  | "vatAmount"
  | "totalDue"
  | "adjustment"
  | "rounding"
  | "pointsUsed"
  | "amountPaid"
  | "cash"
  | "change"
  | "ewalletRef"
  | "receiptNo"
  | "date"
  | "time"
  | "dateTime"
  | "cashier"
  | "customer"
  | "branch"
  | "paymentMethod"
  | "discountName"
  | "discountRate"
  | "discountHolder"
  | "discountIdNumber"
  | "pointsEarned"
  | "pointsBalance";
export type FieldKey = TotalsKey;

// How one value sits on its line:
// pair = label left, value right · inline = "Label: value" · value = the value alone.
export type FieldLayout = "pair" | "inline" | "value";

export type TotalsLine = TotalsLineBody & { showWhen?: Condition };
type TotalsLineBody =
  | {
      id: string;
      kind: "formula";
      label: string;
      expr: string;
      format: FormulaFormat;
      decimals: number;
      style: Style;
      minus: boolean;
      hideWhenZero: boolean;
      layout?: FieldLayout;
      align?: Align;
    }
  | {
      id: string;
      kind: "value";
      key: TotalsKey;
      label: string;
      style: Style;
      minus: boolean;
      hideWhenZero: boolean;
      layout?: FieldLayout; // pair when unset
      align?: Align; // for inline / value layouts
    }
  | { id: string; kind: "heading"; text: string; align: Align; style: Style }
  | { id: string; kind: "rule"; char: RuleChar }
  // The standard step-by-step computation (Total Sales → Less VAT → Less
  // Discount → …), worded exactly as on today's receipt.
  | { id: string; kind: "computation"; style: Style };

export type Block =
  | (BlockBase & { type: "logo"; widthPct: number })
  // labels: what's printed before each detail ("TIN: ", "VAT REG TIN:"), exactly as typed.
  | (BlockBase & { type: "storeInfo"; fields: Record<StoreField, boolean>; labels: StoreLabels; nameStyle: Style })
  | (BlockBase & { type: "title"; text: string; uppercase: boolean })
  | (BlockBase & { type: "saleDetails"; fields: SaleDetailField[] })
  | (BlockBase & {
      type: "items";
      header: boolean;
      headerRule: boolean; // a rule under the header
      countRule: boolean; // a rule above "Total Items"
      headerLeft: string;
      headerRight: string;
      headerStyle: Style;
      nameStyle: Style;
      showVatMarker: boolean;
      showGenericName: boolean;
      showItemCount: boolean;
      itemCountLabel: string;
      countMode: "pieces" | "products"; // pieces: 2 + 2 = 4 · products: 2 lines = 2
      itemFormat: ItemFormat | null; // null = standard two-line items
      vatCodes: VatCodes;
    })
  // Several values side by side on one line.
  | (BlockBase & { type: "row"; cells: RowCell[]; gap: number })
  // A value the owner computes from the sale (display only).
  | (BlockBase & {
      type: "formula";
      label: string;
      expr: string;
      format: FormulaFormat;
      decimals: number;
      layout: FieldLayout;
      minus: boolean;
      hideWhenZero: boolean;
    })
  // One value, anywhere on the receipt.
  | (BlockBase & {
      type: "field";
      key: FieldKey;
      label: string;
      layout: FieldLayout;
      minus: boolean;
      hideWhenZero: boolean;
    })
  | (BlockBase & { type: "totals"; lines: TotalsLine[] })
  | (BlockBase & { type: "scPwd"; titleStyle: Style })
  | (BlockBase & {
      type: "payment";
      showPointsPaid: boolean;
      showMethod: boolean;
      showReference: boolean;
      showCash: boolean;
      showChange: boolean;
      showPointsEarned: boolean;
      showPointsBalance: boolean;
      methodAsPair: boolean; // "Payment: CASH" (false) or label/value on one padded row (true)
    })
  | (BlockBase & { type: "loyalty"; showEarned: boolean; showBalance: boolean })
  | (BlockBase & { type: "remarks"; heading: string; headingStyle: Style })
  | (BlockBase & { type: "text"; text: string })
  | (BlockBase & { type: "qr"; content: string; sizePct: number; caption: string })
  | (BlockBase & { type: "barcode"; height: number; showText: boolean })
  | (BlockBase & { type: "rule"; char: RuleChar })
  | (BlockBase & { type: "footer"; noticeFirst: boolean });

export type BlockType = Block["type"];

export interface Template {
  version: number;
  paperWidth: PaperWidth;
  printMode: PrintMode;
  theme: Theme;
  blocks: Block[];
}
