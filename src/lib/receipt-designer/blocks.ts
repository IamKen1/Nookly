import type { Block, BlockType, SaleDetailField, TotalsKey, TotalsLine } from "./types";
import { TOTALS_FIELDS } from "./totals";

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
};

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
      };
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
