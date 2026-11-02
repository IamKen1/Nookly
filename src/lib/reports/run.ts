import type { ReportKey, ReportResult } from "./registry";
import type { ReportContext } from "./context";
import { paymentMethods, salesByBranch, salesByCashier, salesByCategory, salesByHour, salesByProduct, salesSummary, voidsReturns } from "./sales";
import { discountListing, expensesReport, profitLoss, vatSummary } from "./finance";
import { expiry, inventoryValuation, reorder, slowMoving, stockMovement, transfers } from "./inventory";
import { overview } from "./overview";
import { eServices, payablesAging, prescriptionsReport, purchaseLog, purchasesBySupplier, shiftSummary, supplierReturns } from "./operations";

export const RUNNERS: Record<ReportKey, (ctx: ReportContext & { canPay?: boolean }) => Promise<ReportResult>> = {
  overview,
  "sales-summary": salesSummary,
  "sales-by-product": salesByProduct,
  "sales-by-category": salesByCategory,
  "sales-by-cashier": salesByCashier,
  "sales-by-branch": salesByBranch,
  "sales-by-hour": salesByHour,
  "payment-methods": paymentMethods,
  "voids-returns": voidsReturns,
  "vat-summary": vatSummary,
  "discount-listing": discountListing,
  "profit-loss": profitLoss,
  expenses: expensesReport,
  "inventory-valuation": inventoryValuation,
  reorder,
  expiry,
  "slow-moving": slowMoving,
  "stock-movement": stockMovement,
  transfers,
  "purchases-by-supplier": purchasesBySupplier,
  "purchase-log": purchaseLog,
  "payables-aging": payablesAging,
  "supplier-returns": supplierReturns,
  "shift-summary": shiftSummary,
  "e-services": eServices,
  prescriptions: prescriptionsReport,
};
