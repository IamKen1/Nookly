import type { ReceiptData } from "@/types/receipt";
import { formatPaymentMethodLabel } from "@/types/receipt";
import { loyaltyLines } from "@/lib/receipt";
import type { TotalsKey } from "./types";

export type TotalsFormat = "money" | "int" | "text";

interface Field {
  name: string; // what it is, shown in the designer's element list
  label: string; // default label on the receipt (owners can rename)
  format: TotalsFormat;
  // null = doesn't apply to this sale (the line is skipped).
  value: (r: ReceiptData) => number | string | null;
}

const money = (n: number) => Math.round(n * 100) / 100;
const person = (p?: { firstName: string; lastName: string } | null) => (p ? `${p.firstName} ${p.lastName}`.trim() : null);
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
  date: { name: "Date", label: "Date:", format: "text", value: (r) => r.date.toLocaleDateString("en-PH") },
  time: {
    name: "Time",
    label: "Time:",
    format: "text",
    value: (r) => r.date.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit", hour12: true }),
  },
  dateTime: {
    name: "Date and time",
    label: "Date:",
    format: "text",
    value: (r) =>
      `${r.date.toLocaleDateString("en-PH")} ${r.date.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit", hour12: true })}`,
  },
  cashier: { name: "Cashier", label: "Cashier:", format: "text", value: (r) => person(r.cashier) },
  customer: { name: "Customer", label: "Customer:", format: "text", value: (r) => person(r.customer) },
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

// Owners can put these in any label; they're filled from the sale.
export const LABEL_TOKENS: { token: string; name: string }[] = [
  { token: "{points}", name: "points used" },
  { token: "{discountName}", name: "discount name" },
  { token: "{discountRate}", name: "discount rate" },
];

export const fillLabel = (label: string, r: ReceiptData) =>
  label.includes("{")
    ? label
        .replace(/\{points\}/g, String(r.loyalty?.pointsRedeemed ?? 0))
        .replace(/\{discountName\}/g, r.discountName || r.discountType || "")
        .replace(/\{discountRate\}/g, r.discountRate || "")
    : label;
