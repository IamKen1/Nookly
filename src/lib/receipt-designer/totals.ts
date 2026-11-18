import type { ReceiptData } from "@/types/receipt";
import type { TotalsKey } from "./types";

export type TotalsFormat = "money" | "int" | "text";

interface TotalsField {
  label: string; // default label (owners can rename)
  group: "Before discount" | "Discount" | "Breakdown" | "Due" | "Payment";
  format: TotalsFormat;
  // null = doesn't apply to this sale (the line is skipped).
  value: (r: ReceiptData) => number | string | null;
}

const money = (n: number) => Math.round(n * 100) / 100;

// Every value the Totals block can show. All read from the saved sale, so a
// designed receipt always agrees with Sales, shift readings and reports.
export const TOTALS_FIELDS: Record<TotalsKey, TotalsField> = {
  grossTotal: { label: "Total Sales:", group: "Before discount", format: "money", value: (r) => r.subtotal },
  vatableGross: { label: "VATable (gross):", group: "Before discount", format: "money", value: (r) => r.vatableGross ?? 0 },
  nonVatableGross: { label: "Non-VAT (gross):", group: "Before discount", format: "money", value: (r) => r.nonVatableGross ?? 0 },
  itemCount: { label: "Items:", group: "Before discount", format: "int", value: (r) => r.items.length },
  quantity: { label: "Quantity:", group: "Before discount", format: "int", value: (r) => r.items.reduce((s, i) => s + i.quantity, 0) },

  discount: {
    label: "Less: Discount:",
    group: "Discount",
    format: "money",
    value: (r) => r.discountAmount ?? 0,
  },
  vatRemoved: { label: "Less: VAT (SC/PWD):", group: "Discount", format: "money", value: (r) => r.vatRemovedFromVatable ?? 0 },
  totalSavings: {
    label: "Total Savings:",
    group: "Discount",
    format: "money",
    value: (r) => money((r.discountAmount ?? 0) + (r.vatRemovedFromVatable ?? 0)),
  },

  vatableSales: { label: "VATable Sales:", group: "Breakdown", format: "money", value: (r) => r.vatableSales ?? 0 },
  vatExemptSales: { label: "VAT-Exempt Sales:", group: "Breakdown", format: "money", value: (r) => r.vatExemptSales ?? 0 },
  zeroRatedSales: { label: "Zero-Rated Sales:", group: "Breakdown", format: "money", value: (r) => r.zeroRatedSales ?? 0 },
  nonVatableSales: { label: "Non-VAT Sales:", group: "Breakdown", format: "money", value: (r) => r.nonVatableSales ?? 0 },
  vatAmount: { label: "12% VAT:", group: "Breakdown", format: "money", value: (r) => r.taxAmount },

  totalDue: { label: "TOTAL AMOUNT DUE:", group: "Due", format: "money", value: (r) => r.totalAmount },
  pointsUsed: {
    label: "Points used:",
    group: "Due",
    format: "money",
    value: (r) => (r.loyalty && r.loyalty.pointsRedeemed > 0 ? r.loyalty.pointsAmount : null),
  },
  amountPaid: {
    label: "Amount paid:",
    group: "Due",
    format: "money",
    value: (r) => (r.loyalty && r.loyalty.pointsRedeemed > 0 ? money(r.totalAmount - r.loyalty.pointsAmount) : null),
  },

  cash: { label: "Cash:", group: "Payment", format: "money", value: (r) => (r.cashReceived ? r.cashReceived : null) },
  change: { label: "Change:", group: "Payment", format: "money", value: (r) => (r.changeGiven != null ? r.changeGiven : null) },
  ewalletRef: { label: "Ref No:", group: "Payment", format: "text", value: (r) => r.paymentReference || null },
};

export const TOTALS_KEYS = Object.keys(TOTALS_FIELDS) as TotalsKey[];
