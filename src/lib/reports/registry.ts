// The report catalog — keys, names, and groups only (no database code), so the
// Reports screen and the ops console's plan checklist can both import it.
// Keys are stored in Plan.enabledReports; never rename one without a migration.

export const REPORT_GROUPS = ["Sales", "Tax & compliance", "Profit", "Inventory", "Purchasing", "Cash & other"] as const;
export type ReportGroup = (typeof REPORT_GROUPS)[number];

export const REPORTS = [
  { key: "sales-summary", group: "Sales", label: "Sales summary", description: "Daily gross sales, discounts, returns, net sales, VAT, and payment split" },
  { key: "sales-by-product", group: "Sales", label: "Sales by product", description: "Units and net sales per product, with cost, gross profit, and margin" },
  { key: "sales-by-category", group: "Sales", label: "Sales by category", description: "Net sales, gross profit, and share per category" },
  { key: "sales-by-cashier", group: "Sales", label: "Sales by cashier", description: "Transactions, net sales, discounts, voids, and returns per cashier" },
  { key: "sales-by-branch", group: "Sales", label: "Sales by branch", description: "Branches side by side: sales, profit, average sale, and share", multiBranch: true },
  { key: "sales-by-hour", group: "Sales", label: "Sales by hour & day", description: "When customers buy — by hour of day and by day of week" },
  { key: "payment-methods", group: "Sales", label: "Payment methods", description: "Cash and e-wallet by provider, with counts and shares" },
  { key: "voids-returns", group: "Sales", label: "Voids & returns", description: "Every voided sale and return, with who, when, and how much" },
  { key: "vat-summary", group: "Tax & compliance", label: "VAT summary", description: "VATable sales, output VAT, VAT-exempt (SC/PWD), and non-VAT sales per day" },
  { key: "discount-listing", group: "Tax & compliance", label: "Discount listing (SC/PWD)", description: "Each discounted sale with ID holder, ID number, VAT exemption, and discount" },
  { key: "profit-loss", group: "Profit", label: "Profit & loss", description: "Net sales, cost of goods sold, gross profit, expenses, and net income" },
  { key: "expenses", group: "Profit", label: "Expenses", description: "Shift expenses by date, branch, and cashier" },
  { key: "inventory-valuation", group: "Inventory", label: "Inventory valuation", description: "Stock on hand per product at cost and at selling price" },
  { key: "reorder", group: "Inventory", label: "Reorder suggestions", description: "Low stock with average daily sales, days of cover, and how much to order" },
  { key: "expiry", group: "Inventory", label: "Expiry report", description: "Every lot with stock by expiry date, days left, and value at cost" },
  { key: "slow-moving", group: "Inventory", label: "Slow-moving stock", description: "Products with stock that sold little or nothing in the period" },
  { key: "stock-movement", group: "Inventory", label: "Stock movement ledger", description: "Every stock change: sales, deliveries, adjustments, transfers, write-offs" },
  { key: "transfers", group: "Inventory", label: "Branch transfers", description: "Stock moved between branches", multiBranch: true },
  { key: "purchases-by-supplier", group: "Purchasing", label: "Purchases by supplier", description: "Deliveries, units, and amounts per supplier, less returns" },
  { key: "purchase-log", group: "Purchasing", label: "Purchase log", description: "Every delivery line: supplier, DR #, product, batch, expiry, and cost" },
  { key: "payables-aging", group: "Purchasing", label: "Payables aging", description: "What's owed to each supplier by how overdue it is" },
  { key: "supplier-returns", group: "Purchasing", label: "Returns to suppliers", description: "Stock sent back to suppliers, with reason and settlement" },
  { key: "shift-summary", group: "Cash & other", label: "Shifts & cash variance", description: "Each shift's sales, expected cash, counted cash, and over/short" },
  { key: "e-services", group: "Cash & other", label: "E-services", description: "E-wallet cash-in, cash-out, and load, with fees earned" },
  { key: "prescriptions", group: "Cash & other", label: "Prescriptions", description: "Prescriptions recorded, served vs prescribed, by customer and doctor" },
] as const satisfies readonly { key: string; group: ReportGroup; label: string; description: string; multiBranch?: boolean }[];

export type ReportKey = (typeof REPORTS)[number]["key"];
export const ALL_REPORT_KEYS = REPORTS.map((r) => r.key) as ReportKey[];
export const REPORT_LABELS = Object.fromEntries(REPORTS.map((r) => [r.key, r.label])) as Record<ReportKey, string>;
export const isReportKey = (value: unknown): value is ReportKey => ALL_REPORT_KEYS.includes(value as ReportKey);

// Reports that read the date range (the rest show the current state).
export const POINT_IN_TIME: ReportKey[] = ["inventory-valuation", "reorder", "expiry", "payables-aging"];

export type CellFormat = "text" | "int" | "money" | "pct" | "date" | "datetime" | "qty";

export interface ReportColumn {
  key: string;
  label: string;
  format?: CellFormat;
  // Sum this column into the totals row.
  total?: boolean;
}

export interface ReportResult {
  // Short figures shown above the table.
  summary: { label: string; value: number | string; format?: CellFormat }[];
  columns: ReportColumn[];
  rows: Record<string, string | number | null>[];
  // Shown under the table, e.g. how a figure was computed.
  note?: string;
}
