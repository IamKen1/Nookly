// The owner's price formula and cash rounding (Receipt designer › Apply to POS)
// summed over some sales, for shift readings and the daily closing. Both are
// already inside each sale's total; this shows how much of the total they were.
// Voided sales don't count. Zero counts on workspaces that never used them.
export interface PriceAdjustments {
  formulaCount: number;
  formulaAmount: number; // + the formula added, − it took off
  roundingCount: number;
  roundingAmount: number; // ≤ 0, cash rounding is always down
}

type Amount = { toString(): string } | number | null;

export function priceAdjustments(sales: { status: string; adjustmentAmount: Amount; roundingAmount: Amount }[]): PriceAdjustments {
  const out: PriceAdjustments = { formulaCount: 0, formulaAmount: 0, roundingCount: 0, roundingAmount: 0 };
  for (const s of sales) {
    if (s.status === "CANCELLED") continue;
    const formula = Number(s.adjustmentAmount ?? 0);
    const rounding = Number(s.roundingAmount ?? 0);
    if (formula !== 0) {
      out.formulaCount += 1;
      out.formulaAmount += formula;
    }
    if (rounding !== 0) {
      out.roundingCount += 1;
      out.roundingAmount += rounding;
    }
  }
  out.formulaAmount = Math.round(out.formulaAmount * 100) / 100;
  out.roundingAmount = Math.round(out.roundingAmount * 100) / 100;
  return out;
}
