import type { ReceiptStoreSettings } from "@/types/receipt";
import type { Block, BlockType, Template, TotalsLine } from "./types";
import { TEMPLATE_VERSION } from "./types";
import { newBlock, newId, valueLine } from "./blocks";

type PresetKey = "classic" | "chain" | "compact" | "promo";

export const PRESETS: { key: PresetKey; label: string; description: string }[] = [
  { key: "classic", label: "Nookly Classic", description: "Your receipt today, block for block." },
  { key: "chain", label: "Chain drugstore", description: "VAT summary, V/N per item, barcode at the bottom." },
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
    make("items"),
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
  const blocks = key === "classic" ? classic(settings) : key === "chain" ? chain(settings) : key === "compact" ? compact() : promo(settings);
  return { version: TEMPLATE_VERSION, paperWidth, printMode: "TEXT", theme: { style: {} }, blocks };
}
