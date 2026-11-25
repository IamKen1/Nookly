import { peso } from "@/lib/format";
import type { PriceAdjustments } from "@/lib/price-adjustments";

const signed = (n: number) => (n < 0 ? `-${peso(-n)}` : `+${peso(n)}`);

// The owner's price formula and cash rounding, as rows of a shift reading or
// daily closing. Nothing at all on workspaces that don't use them.
export default function PriceAdjustmentRows({ value }: { value?: PriceAdjustments }) {
  if (!value) return null;
  return (
    <>
      {value.formulaCount > 0 && (
        <div className="flex justify-between" title="Your price formula (Receipt designer › What the POS charges). Already in net sales.">
          <span>Price formula ({value.formulaCount})</span>
          <span>{signed(value.formulaAmount)}</span>
        </div>
      )}
      {value.roundingCount > 0 && (
        <div className="flex justify-between" title="Cash rounding down (Receipt designer › What the POS charges). Already in net sales.">
          <span>Cash rounding ({value.roundingCount})</span>
          <span>{signed(value.roundingAmount)}</span>
        </div>
      )}
    </>
  );
}
