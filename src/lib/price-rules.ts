import { peso } from "@/lib/format";

// A selling price at or below the cost price sells at a loss. It's allowed
// (a store may need it, e.g. a promo), but whoever saves it is warned first.
// Shared by the product form and the spreadsheet import so they say the same thing.
export function sellingBelowCostMessage(costPrice: number, sellingPrice: number, what = "Selling price"): string | null {
  if (!Number.isFinite(costPrice) || !Number.isFinite(sellingPrice)) return null;
  if (sellingPrice > costPrice) return null;
  return `${what} (${peso(sellingPrice)}) is ${sellingPrice === costPrice ? "the same as" : "below"} the cost price (${peso(costPrice)}).`;
}
