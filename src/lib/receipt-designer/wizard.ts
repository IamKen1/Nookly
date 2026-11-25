// Guided setup: a few simple answers → a complete design.
import type { ReceiptStoreSettings } from "@/types/receipt";
import type { Block, DateFormat, PaperWidth, Template } from "./types";
import { ITEM_FORMATS, newBlock } from "./blocks";
import { DEFAULT_FORMAT, DEFAULT_VAT_CODES } from "./format";
import { buildPreset, registerItems, vatSummary } from "./presets";

export type WizardStyle = "classic" | "chain" | "register" | "compact" | "promo";
export type WizardItems = "standard" | "twoLine" | "oneLine" | "table" | "register";

export interface WizardAnswers {
  style: WizardStyle;
  paperWidth: PaperWidth;
  peso: boolean;
  date: DateFormat;
  items: WizardItems;
  vatSummary: boolean;
  barcode: boolean;
  qrLink: string; // empty = no QR code
  message: string; // a line of your own near the bottom; empty = none
}

export const WIZARD_STYLES: { key: WizardStyle; label: string; description: string }[] = [
  { key: "classic", label: "Simple & clear", description: "Nookly's standard receipt. A safe start." },
  { key: "register", label: "Big-chain register", description: "No ₱ sign, barcode per item, VAT summary." },
  { key: "chain", label: "Modern drugstore", description: "Logo, big total, VAT breakdown." },
  { key: "compact", label: "Paper saver", description: "Fewest lines." },
  { key: "promo", label: "With promo", description: "Promo banner and a QR code." },
];

export const WIZARD_ITEMS: { key: WizardItems; label: string; example: string }[] = [
  { key: "standard", label: "Name, then qty × price", example: "Biogesic 500mg\n2 x ₱6.50      ₱13.00 V" },
  { key: "oneLine", label: "All on one line", example: "2  Biogesic 500mg   ₱13.00" },
  { key: "table", label: "Table with columns", example: "ITEM       QTY PRICE AMOUNT\nBiogesic     2  6.50  13.00" },
  { key: "register", label: "Barcode and qty @ price", example: "BIOGESIC 500MG       13.00T\n    4800010012345  2 @ 6.50" },
];

const isSummaryRow = (b: Block) => b.type === "row" && b.cells.some((c) => c.kind === "text" && /^\((T|X|Z)\)$/.test(c.text));

// What the style starts with, so the questions after it begin with matching answers.
export function answersFor(style: WizardStyle, paperWidth: PaperWidth = 58): WizardAnswers {
  return {
    style,
    paperWidth,
    peso: style !== "register",
    date: style === "register" ? "MM-DD-YY" : "default",
    items: style === "register" ? "register" : "standard",
    vatSummary: style === "register",
    barcode: style === "chain",
    qrLink: style === "promo" ? "https://" : "",
    message: "",
  };
}

export function buildFromAnswers(a: WizardAnswers, settings: ReceiptStoreSettings): Template {
  const base = buildPreset(a.style, settings, a.paperWidth);
  let blocks = [...base.blocks];

  // item lines
  blocks = blocks.map((b) => {
    if (b.type !== "items") return b;
    if (a.items === "register") return { ...registerItems(), id: b.id };
    const reset = { ...b, vatCodes: { ...DEFAULT_VAT_CODES } };
    if (a.items === "standard") return { ...reset, itemFormat: null };
    return { ...reset, itemFormat: ITEM_FORMATS.find((f) => f.key === a.items)!.make() };
  });

  // extras, placed just above the footer (or at the end)
  const beforeFooter = (add: Block[]) => {
    const i = blocks.findIndex((b) => b.type === "footer");
    blocks.splice(i < 0 ? blocks.length : i, 0, ...add);
  };
  const hasSummary = blocks.some(isSummaryRow);
  if (a.vatSummary && !hasSummary) beforeFooter([{ ...newBlock("rule"), char: "-" } as Block, ...vatSummary()]);
  if (!a.vatSummary && hasSummary) blocks = blocks.filter((b) => !isSummaryRow(b));
  if (!a.barcode) blocks = blocks.filter((b) => b.type !== "barcode");
  else if (!blocks.some((b) => b.type === "barcode")) beforeFooter([newBlock("barcode")]);
  const qr = a.qrLink.trim();
  if (!qr) blocks = blocks.filter((b) => b.type !== "qr");
  else if (blocks.some((b) => b.type === "qr")) blocks = blocks.map((b) => (b.type === "qr" ? { ...b, content: qr } : b));
  else beforeFooter([{ ...newBlock("qr"), content: qr, caption: "Scan me!" } as Block]);
  if (a.message.trim()) beforeFooter([{ ...newBlock("text"), text: a.message.trim(), spaceBefore: 1 } as Block]);

  return {
    ...base,
    paperWidth: a.paperWidth,
    theme: {
      ...base.theme,
      format: { ...DEFAULT_FORMAT, ...base.theme.format, currency: a.peso ? "peso" : "none", date: a.date },
    },
    blocks,
  };
}
