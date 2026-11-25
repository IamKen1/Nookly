import type { ReceiptData } from "@/types/receipt";
import { formatPaymentMethodLabel } from "@/types/receipt";
import { loyaltyLines } from "@/lib/receipt";
import type { TotalsKey, ValueFormat } from "./types";
import { DEFAULT_FORMAT, formatDate, formatName, formatTime, moneyFormatter } from "./format";

export type TotalsFormat = "money" | "int" | "text";

interface Field {
  name: string; // what it is, shown in the designer's element list
  label: string; // default label on the receipt (owners can rename)
  format: TotalsFormat;
  // null = doesn't apply to this sale (the line is skipped).
  // f: the design's date/time/name formats (today's formats when not given).
  value: (r: ReceiptData, f?: ValueFormat) => number | string | null;
}

const money = (n: number) => Math.round(n * 100) / 100;
const hasPoints = (r: ReceiptData) => Boolean(r.loyalty && r.loyalty.pointsRedeemed > 0);

// Every value a receipt can show, each usable anywhere on the receipt: as its
// own element or as a line inside a group. All read from the saved sale, so a
// designed receipt always agrees with Sales, shift readings and reports.
export const TOTALS_FIELDS: Record<TotalsKey, Field> = {
  // amounts
  grossTotal: { name: "Subtotal (before discount)", label: "Subtotal:", format: "money", value: (r) => r.subtotal },
  vatableGross: { name: "VATable items (before discount)", label: "VATable (gross):", format: "money", value: (r) => r.vatableGross ?? 0 },
  nonVatableGross: { name: "Non-VAT items (before discount)", label: "Non-VAT (gross):", format: "money", value: (r) => r.nonVatableGross ?? 0 },
  discount: { name: "Discount", label: "Less: Discount:", format: "money", value: (r) => r.discountAmount ?? 0 },
  vatRemoved: { name: "VAT removed (SC/PWD)", label: "Less: VAT (SC/PWD):", format: "money", value: (r) => r.vatRemovedFromVatable ?? 0 },
  totalSavings: {
    name: "Total savings",
    label: "Total Savings:",
    format: "money",
    value: (r) => money((r.discountAmount ?? 0) + (r.vatRemovedFromVatable ?? 0)),
  },
  vatableSales: { name: "VATable sales", label: "VATable Sales:", format: "money", value: (r) => r.vatableSales ?? 0 },
  vatExemptSales: { name: "VAT-exempt sales", label: "VAT-Exempt Sales:", format: "money", value: (r) => r.vatExemptSales ?? 0 },
  zeroRatedSales: { name: "Zero-rated sales", label: "Zero-Rated Sales:", format: "money", value: (r) => r.zeroRatedSales ?? 0 },
  nonVatableSales: { name: "Non-VAT sales", label: "Non-VAT Sales:", format: "money", value: (r) => r.nonVatableSales ?? 0 },
  vatAmount: { name: "12% VAT", label: "12% VAT:", format: "money", value: (r) => r.taxAmount },
  totalDue: { name: "Total amount due", label: "TOTAL AMOUNT DUE:", format: "money", value: (r) => r.totalAmount },
  // Only on sales where the owner's POS pricing rules changed the total.
  adjustment: {
    name: "Price adjustment (your formula)",
    label: "Adjustment:",
    format: "money",
    value: (r) => (r.adjustmentAmount ? r.adjustmentAmount : null),
  },
  rounding: { name: "Cash rounding", label: "Rounding:", format: "money", value: (r) => (r.roundingAmount ? r.roundingAmount : null) },
  pointsUsed: {
    name: "Points used (peso value)",
    label: "Points used ({points}):",
    format: "money",
    value: (r) => (hasPoints(r) ? r.loyalty!.pointsAmount : null),
  },
  amountPaid: {
    name: "Amount paid (after points)",
    label: "Amount paid:",
    format: "money",
    value: (r) => (hasPoints(r) ? money(r.totalAmount - r.loyalty!.pointsAmount) : null),
  },
  cash: { name: "Cash received", label: "Cash:", format: "money", value: (r) => (r.cashReceived ? r.cashReceived : null) },
  change: { name: "Change", label: "Change:", format: "money", value: (r) => (r.changeGiven != null ? r.changeGiven : null) },

  // counts
  quantity: { name: "Total items (pieces)", label: "Total Items:", format: "int", value: (r) => r.items.reduce((s, i) => s + i.quantity, 0) },
  itemCount: { name: "Number of products (lines)", label: "Products:", format: "int", value: (r) => r.items.length },

  // the sale
  receiptNo: { name: "AR number", label: "AR No:", format: "text", value: (r) => r.saleNumber },
  date: { name: "Date", label: "Date:", format: "text", value: (r, f = DEFAULT_FORMAT) => formatDate(r.date, f.date) },
  time: { name: "Time", label: "Time:", format: "text", value: (r, f = DEFAULT_FORMAT) => formatTime(r.date, f.time) },
  dateTime: {
    name: "Date and time",
    label: "Date:",
    format: "text",
    value: (r, f = DEFAULT_FORMAT) => `${formatDate(r.date, f.date)} ${formatTime(r.date, f.time)}`,
  },
  cashier: { name: "Cashier", label: "Cashier:", format: "text", value: (r, f = DEFAULT_FORMAT) => formatName(r.cashier, f.cashierName) },
  customer: { name: "Customer", label: "Customer:", format: "text", value: (r, f = DEFAULT_FORMAT) => formatName(r.customer, f.customerName) },
  branch: { name: "Branch", label: "Branch:", format: "text", value: (r) => r.branchName ?? null },

  // payment
  paymentMethod: {
    name: "Payment method",
    label: "Payment:",
    format: "text",
    value: (r) => (loyaltyLines(r).paidWithPointsOnly ? "LOYALTY POINTS" : formatPaymentMethodLabel(r.paymentMethod, r.paymentProvider)),
  },
  ewalletRef: { name: "E-wallet reference no.", label: "Ref No:", format: "text", value: (r) => r.paymentReference || null },

  // discount
  discountName: {
    name: "Discount name",
    label: "Discount:",
    format: "text",
    value: (r) => (r.discountAmount && r.discountAmount > 0 ? r.discountName || r.discountType || null : null),
  },
  discountRate: { name: "Discount rate", label: "Rate:", format: "text", value: (r) => (r.discountAmount && r.discountAmount > 0 ? r.discountRate || null : null) },
  discountHolder: { name: "SC/PWD name", label: "Name:", format: "text", value: (r) => r.discountHolderName?.trim() || null },
  discountIdNumber: { name: "SC/PWD ID no.", label: "ID No:", format: "text", value: (r) => r.discountIdNumber?.trim() || null },

  // loyalty
  pointsEarned: {
    name: "Points earned",
    label: "Points earned:",
    format: "int",
    value: (r) => (r.loyalty && r.loyalty.pointsEarned > 0 ? r.loyalty.pointsEarned : null),
  },
  pointsBalance: { name: "Points balance", label: "Points balance:", format: "int", value: (r) => r.loyalty?.balanceAfter ?? null },
};

export const TOTALS_KEYS = Object.keys(TOTALS_FIELDS) as TotalsKey[];

// Every value, A–Z by what it is. No fixed groups: any value can go anywhere.
export const FIELDS_BY_NAME = [...TOTALS_KEYS].sort((a, b) => TOTALS_FIELDS[a].name.localeCompare(TOTALS_FIELDS[b].name));

// Store details that can go in any text: {storeName}, {tin}…
const STORE_TOKENS: Record<string, { name: string; value: (r: ReceiptData) => string | null | undefined }> = {
  storeName: { name: "store name", value: (r) => r.store.storeName },
  address: { name: "address", value: (r) => [r.store.addressLine1, r.store.addressLine2].filter(Boolean).join(", ") },
  contact: { name: "contact no.", value: (r) => r.store.contactNumber },
  tin: { name: "TIN", value: (r) => r.store.tin },
  permit: { name: "permit no.", value: (r) => r.store.permitNumber },
  accreditation: { name: "accreditation no.", value: (r) => r.store.accreditationNumber },
  serial: { name: "serial no.", value: (r) => r.store.serialNumberLabel },
};

// Owners can put these in any text or label; they're filled from the sale.
// Any value's key works too ({quantity}, {receiptNo}, {cashier}…).
export const LABEL_TOKENS: { token: string; name: string }[] = [
  { token: "{points}", name: "points used" },
  { token: "{discountName}", name: "discount name" },
  { token: "{discountRate}", name: "discount rate" },
];

// Every token, for the designer's help list.
export const ALL_TOKENS: { token: string; name: string }[] = [
  ...Object.entries(STORE_TOKENS).map(([k, t]) => ({ token: `{${k}}`, name: t.name })),
  ...FIELDS_BY_NAME.map((k) => ({ token: `{${k}}`, name: TOTALS_FIELDS[k].name.toLowerCase() })),
  { token: "{points}", name: "points used (count)" },
];

// A value as text, for a {token}. Empty when it doesn't apply to this sale.
export function tokenValue(key: string, r: ReceiptData, f: ValueFormat = DEFAULT_FORMAT): string | undefined {
  if (key === "points") return String(r.loyalty?.pointsRedeemed ?? 0);
  if (key === "discountName") return r.discountName || r.discountType || "";
  if (key === "discountRate") return r.discountRate || "";
  if (key === "adjustmentLabel") return r.adjustmentLabel || "Adjustment";
  if (Object.hasOwn(STORE_TOKENS, key)) return STORE_TOKENS[key].value(r)?.trim() ?? "";
  if (!Object.hasOwn(TOTALS_FIELDS, key)) return undefined; // not a token: printed as typed
  const field = TOTALS_FIELDS[key as TotalsKey];
  const v = field.value(r, f);
  if (v === null || v === undefined) return "";
  return field.format === "money" ? moneyFormatter(f)(v as number) : String(v);
}

// {adjustmentLabel}: the name of the owner's price formula ("Service fee").
export const fillLabel = (label: string, r: ReceiptData, f: ValueFormat = DEFAULT_FORMAT) =>
  label.includes("{") ? label.replace(/\{([A-Za-z]+)\}/g, (whole, key: string) => tokenValue(key, r, f) ?? whole) : label;
