// The pieces owners drag onto the receipt, grouped by what they're about.
// A tile can add several parts at once (e.g. the VAT summary).
import type { Block, BlockType, TotalsKey, TotalsLine } from "./types";
import { ITEM_FORMATS, newBlock, newField, newId, newItemCell, valueLine } from "./blocks";
import { TOTALS_FIELDS } from "./totals";
import { registerItems, vatSummary } from "./presets";

export type TileCategory = "store" | "sale" | "items" | "totals" | "payment" | "scpwd" | "loyalty" | "extras";

export const TILE_CATEGORIES: { key: TileCategory; label: string; emoji: string; color: string }[] = [
  { key: "store", label: "Store", emoji: "🏪", color: "amber" },
  { key: "sale", label: "Sale details", emoji: "🧾", color: "sky" },
  { key: "items", label: "Items", emoji: "💊", color: "violet" },
  { key: "totals", label: "Totals", emoji: "💰", color: "emerald" },
  { key: "payment", label: "Payment", emoji: "💳", color: "blue" },
  { key: "scpwd", label: "Senior / PWD", emoji: "👵", color: "rose" },
  { key: "loyalty", label: "Loyalty points", emoji: "⭐", color: "yellow" },
  { key: "extras", label: "Extras", emoji: "✨", color: "zinc" },
];

export interface Tile {
  id: string;
  category: TileCategory;
  label: string;
  hint?: string; // when it prints, if not always
  make: () => Block[];
}

const one = <T extends BlockType>(type: T, changes: Partial<Extract<Block, { type: T }>> = {}) => () =>
  [{ ...newBlock(type), ...changes } as Block];
const field = (key: TotalsKey, changes: Partial<Extract<Block, { type: "field" }>> = {}) => () => [newField(key, changes)];
const totals = (lines: () => TotalsLine[]) => () => [{ ...(newBlock("totals") as Extract<Block, { type: "totals" }>), lines: lines() }];
const SC = { saleTypes: ["scpwd" as const] };

export const TILES: Tile[] = [
  // store
  { id: "storeInfo", category: "store", label: "Store name & address", make: one("storeInfo") },
  { id: "logo", category: "store", label: "Logo", hint: "Upload it under Whole receipt", make: one("logo") },
  { id: "title", category: "store", label: "Receipt title", make: one("title") },
  { id: "storeLine", category: "store", label: "Store name line", make: one("text", { text: "{storeName}", style: { bold: true } }) },
  { id: "thanks", category: "store", label: "Thank-you message", make: one("footer", { noticeFirst: false }) },

  // sale details
  { id: "saleDetails", category: "sale", label: "Sale details (AR no., date, cashier…)", make: one("saleDetails") },
  { id: "receiptNo", category: "sale", label: "AR number", make: field("receiptNo") },
  { id: "dateTime", category: "sale", label: "Date and time", make: field("dateTime") },
  { id: "cashier", category: "sale", label: "Cashier", make: field("cashier") },
  { id: "customer", category: "sale", label: "Customer", hint: "When the sale has a customer", make: field("customer") },
  { id: "branch", category: "sale", label: "Branch", make: field("branch") },
  {
    id: "rx",
    category: "sale",
    label: "Prescription: Rx no., doctor, PRC no.",
    hint: "On sales with a prescription",
    make: () => (["rxNumber", "doctor", "doctorLicense"] as const).map((k) => newField(k, { layout: "inline", showWhen: { saleTypes: ["prescription"] } })),
  },
  { id: "rxDirections", category: "sale", label: "Prescription directions", hint: "On sales with a prescription", make: field("rxInstructions", { layout: "inline" }) },
  { id: "returnFor", category: "sale", label: "Return for AR no.", hint: "On returns", make: field("originalReceiptNo", { layout: "inline" }) },
  { id: "txnLine", category: "sale", label: "One line: AR no. · date · time · cashier", make: one("text", { text: "#{receiptNo}  {date} {time} {cashier}", align: "left" }) },

  // items
  { id: "items", category: "items", label: "Item list (standard)", make: one("items") },
  ...ITEM_FORMATS.map((f) => ({ id: `items-${f.key}`, category: "items" as const, label: `Item list: ${f.label.split(":")[0].toLowerCase()}`, make: one("items", { itemFormat: f.make() }) })),
  { id: "items-register", category: "items", label: "Item list: barcode & qty @ price", make: () => [registerItems()] },
  {
    id: "lotLine",
    category: "items",
    label: "Add lot & expiry under each item",
    hint: "Adds an item list; items without batches skip the line",
    make: one("items", {
      itemFormat: {
        lines: [
          ...ITEM_FORMATS[0].make().lines,
          { id: newId("l"), style: { font: "B" }, cells: [newItemCell("text", { text: "  Lot", width: 18 }), newItemCell("lotExpiry")] },
        ],
      },
    }),
  },
  { id: "itemCount", category: "items", label: "** 20 item(s) **", make: one("text", { text: "** {quantity} item(s) **" }) },
  { id: "pieces", category: "items", label: "Total pieces", make: field("quantity", { label: "Total Items:", layout: "inline" }) },

  // totals
  { id: "computation", category: "totals", label: "Step-by-step computation", make: totals(() => [{ id: newId("t"), kind: "computation", style: {} }]) },
  { id: "subtotal", category: "totals", label: TOTALS_FIELDS.grossTotal.name, make: field("grossTotal") },
  { id: "discount", category: "totals", label: "Discount", hint: "On sales with a discount", make: field("discount", { label: "Less: {discountName} {discountRate}", minus: true, hideWhenZero: true }) },
  { id: "vatRemoved", category: "totals", label: "VAT removed (SC/PWD)", hint: "On SC/PWD sales", make: field("vatRemoved", { minus: true, hideWhenZero: true }) },
  { id: "savings", category: "totals", label: "Total savings", make: field("totalSavings", { hideWhenZero: true }) },
  { id: "totalDue", category: "totals", label: "TOTAL (big)", make: field("totalDue", { label: "TOTAL:", style: { bold: true, sizeH: 2 } }) },
  {
    id: "vatBreakdown",
    category: "totals",
    label: "VAT breakdown",
    make: totals(() => [
      { id: newId("t"), kind: "heading", text: "VAT BREAKDOWN", align: "left", style: { bold: true } },
      valueLine("vatableSales"),
      valueLine("vatExemptSales"),
      valueLine("zeroRatedSales"),
      valueLine("vatAmount"),
    ]),
  },
  { id: "vatSummary", category: "totals", label: "VAT summary with (T) (X) (Z)", make: vatSummary },
  { id: "formula", category: "totals", label: "My own computation (formula)", make: one("formula") },

  // payment
  { id: "payment", category: "payment", label: "Payment (method, cash, change)", make: one("payment") },
  { id: "cash", category: "payment", label: "Cash received", hint: "On cash sales", make: field("cash") },
  { id: "change", category: "payment", label: "Change", hint: "On cash sales", make: field("change") },
  { id: "method", category: "payment", label: "Payment method", make: field("paymentMethod", { layout: "inline" }) },
  { id: "ewalletRef", category: "payment", label: "E-wallet reference no.", hint: "On e-wallet sales", make: field("ewalletRef") },

  // SC/PWD
  { id: "scPwd", category: "scpwd", label: "SC/PWD box (name, ID, signature)", hint: "On SC/PWD sales", make: one("scPwd") },
  { id: "scName", category: "scpwd", label: "SC/PWD name", hint: "On SC/PWD sales", make: field("discountHolder", { label: "SOLD TO:", layout: "inline" }) },
  { id: "scId", category: "scpwd", label: "OSCA / PWD ID no.", hint: "On SC/PWD sales", make: field("discountIdNumber", { label: "OSCA/PWD ID:", layout: "inline" }) },
  {
    id: "scLines",
    category: "scpwd",
    label: "Signature, address, TIN lines",
    hint: "On SC/PWD sales",
    make: () =>
      ["SIGNATURE : ______________", "ADDRESS   : ______________", "TIN NO    : ______________"].map((text) => ({ ...newBlock("text"), text, align: "left", showWhen: SC }) as Block),
  },

  // loyalty
  { id: "loyalty", category: "loyalty", label: "Points earned & balance", hint: "On sales with points", make: one("loyalty") },
  { id: "pointsEarned", category: "loyalty", label: "Points earned", hint: "On sales with points", make: field("pointsEarned") },
  { id: "pointsBalance", category: "loyalty", label: "Points balance", hint: "On sales with points", make: field("pointsBalance") },
  { id: "pointsUsed", category: "loyalty", label: "Points used", hint: "When points are used", make: field("pointsUsed", { minus: true }) },

  // extras
  { id: "dashes", category: "extras", label: "Divider - - - -", make: one("rule", { char: "-" }) },
  { id: "equals", category: "extras", label: "Divider = = = =", make: one("rule", { char: "=" }) },
  { id: "blank", category: "extras", label: "Blank line", make: one("rule", { char: " " }) },
  { id: "text", category: "extras", label: "Your own text", make: one("text") },
  { id: "promo", category: "extras", label: "Promo banner", make: one("text", { text: "PROMO OF THE MONTH", style: { bold: true, sizeW: 2, sizeH: 2, inverse: true } }) },
  { id: "qr", category: "extras", label: "QR code", hint: "Type your link after adding it", make: one("qr", { content: "https://", caption: "Scan me!" }) },
  { id: "barcode", category: "extras", label: "Barcode of the AR no.", make: one("barcode") },
  { id: "remarks", category: "extras", label: "Dosage / remarks", hint: "When the sale has remarks", make: one("remarks") },
];

export const TILES_BY_ID = new Map(TILES.map((t) => [t.id, t]));

// Fresh ids for everything a tile adds (and the lines inside groups).
export function makeTile(tile: Tile, uid: () => string): Block[] {
  return tile.make().map((b) => (b.type === "totals" ? { ...b, id: uid(), lines: b.lines.map((l) => ({ ...l, id: uid() })) } : { ...b, id: uid() }));
}
