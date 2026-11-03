import { peso } from "@/lib/format";

// A product must sell for more than it costs. Shared by the product form,
// the product API and the spreadsheet import so they say the same thing.
export function sellingBelowCostMessage(costPrice: number, sellingPrice: number, what = "Selling price"): string | null {
  if (!Number.isFinite(costPrice) || !Number.isFinite(sellingPrice)) return null;
  if (sellingPrice > costPrice) return null;
  return `${what} (${peso(sellingPrice)}) must be more than the cost price (${peso(costPrice)}).`;
}
