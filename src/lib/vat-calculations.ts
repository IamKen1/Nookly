// 'NONE', the built-in SENIOR / PWD / STUDENT / EMPLOYEE, or a workspace's own discount code.
export type DiscountType = string

export interface VatCalculationInput {
  vatableTotal: number
  nonVatableTotal: number
  discountType?: DiscountType
  discountPercent?: number
  // Remove VAT first, then discount (the SC/PWD rule). Defaults to true for SENIOR/PWD.
  vatExempt?: boolean
  // A peso amount off instead of a percentage.
  fixedAmount?: number | null
  // Most the discount can take off, in pesos.
  maxAmount?: number | null
}

export interface VatCalculationResult {
  subtotal: number
  vatableSales: number
  nonVatableSales: number
  vatAmount: number
  discountAmount: number
  finalTotal: number
  vatExemptSales?: number // For senior/PWD
  // Intermediate figures kept around purely so getComputationLines() can show
  // every +/- step without re-deriving (and risking drifting from) the numbers
  // actually used above.
  vatableGross: number
  nonVatableGross: number
  vatableDiscountAmount: number
  nonVatableDiscountAmount: number
  vatRemovedFromVatable: number // SENIOR/PWD only — VAT stripped before discounting
}

const VAT_INCLUSIVE_FACTOR = 1.12

const roundMoney = (value: number) => Number(value.toFixed(2))

const isSeniorOrPwd = (discountType?: string) => discountType === 'SENIOR' || discountType === 'PWD'

// Splits a peso discount across the VATable and non-VAT parts in proportion
// to each part's base, so the receipt breakdown stays consistent.
const splitDiscount = (total: number, vatableBase: number, nonVatableBase: number) => {
  const base = vatableBase + nonVatableBase
  const amount = roundMoney(Math.min(Math.max(total, 0), base))
  if (base <= 0 || amount <= 0) return { vatable: 0, nonVatable: 0 }
  const vatable = roundMoney((amount * vatableBase) / base)
  return { vatable, nonVatable: roundMoney(amount - vatable) }
}

// Percent discounts are computed per part exactly as before; a fixed amount
// or a cap re-splits the peso total across the parts.
const discountParts = (
  vatableBase: number,
  nonVatableBase: number,
  percent: number,
  fixedAmount?: number | null,
  maxAmount?: number | null
) => {
  let vatable = roundMoney(vatableBase * (percent / 100))
  let nonVatable = roundMoney(nonVatableBase * (percent / 100))
  if (fixedAmount != null) ({ vatable, nonVatable } = splitDiscount(fixedAmount, vatableBase, nonVatableBase))
  if (maxAmount != null && maxAmount >= 0 && vatable + nonVatable > maxAmount) {
    ;({ vatable, nonVatable } = splitDiscount(maxAmount, vatableBase, nonVatableBase))
  }
  return { vatable, nonVatable }
}

export const calculateVatInclusiveTotals = ({
  vatableTotal,
  nonVatableTotal,
  discountType = 'NONE',
  discountPercent = 0,
  vatExempt,
  fixedAmount,
  maxAmount,
}: VatCalculationInput): VatCalculationResult => {
  const subtotal = roundMoney(vatableTotal + nonVatableTotal)
  const hasDiscount = discountType !== 'NONE'

  if (hasDiscount && (vatExempt ?? isSeniorOrPwd(discountType))) {
    const appliedDiscountPercent = discountPercent > 0 ? discountPercent : isSeniorOrPwd(discountType) ? 20 : 0
    // For vattable items: remove VAT first, then apply discount
    const vatExclusiveVatableTotal = roundMoney(vatableTotal / VAT_INCLUSIVE_FACTOR)
    // For non-vattable items: apply discount directly
    const { vatable: vatableDiscountAmount, nonVatable: nonVatableDiscountAmount } = discountParts(
      vatExclusiveVatableTotal,
      nonVatableTotal,
      appliedDiscountPercent,
      fixedAmount,
      maxAmount
    )
    const vatableSalesAfterDiscount = roundMoney(vatExclusiveVatableTotal - vatableDiscountAmount)
    const nonVatableSalesAfterDiscount = roundMoney(nonVatableTotal - nonVatableDiscountAmount)
    // VAT is zero for the discounted vatable portion
    const vatAmount = 0
    const totalDiscountAmount = roundMoney(vatableDiscountAmount + nonVatableDiscountAmount)
    const finalTotal = roundMoney(vatableSalesAfterDiscount + nonVatableSalesAfterDiscount)

    return {
      subtotal,
      vatableSales: vatableSalesAfterDiscount,
      nonVatableSales: nonVatableSalesAfterDiscount,
      vatAmount,
      discountAmount: totalDiscountAmount,
      finalTotal,
      vatExemptSales: vatExclusiveVatableTotal,
      vatableGross: roundMoney(vatableTotal),
      nonVatableGross: roundMoney(nonVatableTotal),
      vatableDiscountAmount,
      nonVatableDiscountAmount,
      vatRemovedFromVatable: roundMoney(vatableTotal - vatExclusiveVatableTotal),
    }
  }

  const { vatable: vatableDiscountAmount, nonVatable: nonVatableDiscountAmount } = hasDiscount
    ? discountParts(vatableTotal, nonVatableTotal, discountPercent, fixedAmount, maxAmount)
    : { vatable: 0, nonVatable: 0 }
  const discountedVatableGross = vatableTotal - vatableDiscountAmount
  const discountedNonVatableTotal = nonVatableTotal - nonVatableDiscountAmount
  const vatAmount = roundMoney(discountedVatableGross * (12 / 112))
  const vatableSales = roundMoney(discountedVatableGross - vatAmount)
  const discountAmount = roundMoney(vatableDiscountAmount + nonVatableDiscountAmount)
  const finalTotal = roundMoney(subtotal - discountAmount)

  return {
    subtotal,
    vatableSales,
    nonVatableSales: roundMoney(discountedNonVatableTotal),
    vatAmount,
    discountAmount,
    finalTotal,
    vatableGross: roundMoney(vatableTotal),
    nonVatableGross: roundMoney(nonVatableTotal),
    vatableDiscountAmount,
    nonVatableDiscountAmount,
    vatRemovedFromVatable: 0,
  }
}

export interface ComputationLine {
  label: string
  amount: number
  /** "base" = starting gross figure, "subtract" = a -amount deduction, "subtotal"/"total" = a running = result, "savings" = the customer's total benefit */
  kind: 'base' | 'subtract' | 'subtotal' | 'total' | 'savings'
}

// Renders the exact arithmetic behind calculateVatInclusiveTotals as a flat list of
// +/- lines, so a receipt can show its own derivation instead of just the endpoints.
// `display` names the discount and its rate for workspace discounts (e.g.
// "Promo", "₱50.00"); without it the label is the code and percent, as always.
export const getComputationLines = (
  result: VatCalculationResult,
  discountType: DiscountType = 'NONE',
  discountPercent = 0,
  display?: { label?: string; rate?: string; vatExempt?: boolean }
): ComputationLine[] => {
  const lines: ComputationLine[] = []
  const isSeniorPwd = display?.vatExempt ?? isSeniorOrPwd(discountType)
  const appliedPercent = discountType === 'NONE' ? 0 : discountPercent > 0 ? discountPercent : isSeniorOrPwd(discountType) ? 20 : discountPercent
  const discountLabel = `Less: ${display?.label ?? discountType} Discount (${display?.rate ?? `${appliedPercent}%`})`

  if (result.vatableGross > 0) {
    lines.push({ label: 'VATable Sales', amount: result.vatableGross, kind: 'base' })
    if (isSeniorPwd) {
      // VAT stripped first (senior/PWD are VAT-exempt), discount applies after
      lines.push({ label: 'Less: VAT (12%)', amount: -result.vatRemovedFromVatable, kind: 'subtract' })
      if (result.vatableDiscountAmount > 0) {
        lines.push({ label: 'VAT-Exempt Base', amount: result.vatExemptSales ?? 0, kind: 'subtotal' })
        lines.push({ label: discountLabel, amount: -result.vatableDiscountAmount, kind: 'subtract' })
      }
      lines.push({ label: 'Net VATable Sales', amount: result.vatableSales, kind: 'subtotal' })
    } else {
      // Discount applies to the gross price first, VAT is extracted from what's left
      if (result.vatableDiscountAmount > 0) {
        lines.push({ label: discountLabel, amount: -result.vatableDiscountAmount, kind: 'subtract' })
      }
      lines.push({ label: 'Less: VAT (12%)', amount: -result.vatAmount, kind: 'subtract' })
      lines.push({ label: 'Net VATable Sales', amount: result.vatableSales, kind: 'subtotal' })
    }
  }

  if (result.nonVatableGross > 0) {
    lines.push({ label: 'Non-VAT Sales', amount: result.nonVatableGross, kind: 'base' })
    if (result.nonVatableDiscountAmount > 0) {
      lines.push({ label: discountLabel, amount: -result.nonVatableDiscountAmount, kind: 'subtract' })
      lines.push({ label: 'Net Non-VAT Sales', amount: result.nonVatableSales, kind: 'subtotal' })
    }
  }

  if (result.discountAmount > 0) {
    lines.push({ label: 'Total Discount', amount: -result.discountAmount, kind: 'subtract' })
  }

  // For senior/PWD, the customer benefits from BOTH the VAT removal and the
  // discount — "Total Discount" alone understates what they actually saved,
  // since it doesn't include the VAT that was stripped off first.
  if (isSeniorPwd && result.vatRemovedFromVatable > 0) {
    lines.push({ label: 'Total Savings', amount: result.vatRemovedFromVatable + result.discountAmount, kind: 'savings' })
  }

  lines.push({ label: 'Total Amount Due', amount: result.finalTotal, kind: 'total' })
  return lines
}
