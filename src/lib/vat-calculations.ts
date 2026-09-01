export type DiscountType = 'NONE' | 'SENIOR' | 'PWD' | 'STUDENT' | 'EMPLOYEE'

export interface VatCalculationInput {
  vatableTotal: number
  nonVatableTotal: number
  discountType?: DiscountType
  discountPercent?: number
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

export const calculateVatInclusiveTotals = ({
  vatableTotal,
  nonVatableTotal,
  discountType = 'NONE',
  discountPercent = 0,
}: VatCalculationInput): VatCalculationResult => {
  const subtotal = roundMoney(vatableTotal + nonVatableTotal)

  if (discountType === 'SENIOR' || discountType === 'PWD') {
    const appliedDiscountPercent = discountPercent > 0 ? discountPercent : 20
    // For vattable items: remove VAT first, then apply discount
    const vatExclusiveVatableTotal = roundMoney(vatableTotal / VAT_INCLUSIVE_FACTOR)
    const vatableDiscountAmount = roundMoney(vatExclusiveVatableTotal * (appliedDiscountPercent / 100))
    const vatableSalesAfterDiscount = roundMoney(vatExclusiveVatableTotal - vatableDiscountAmount)
    // For non-vattable items: apply discount directly
    const nonVatableDiscountAmount = roundMoney(nonVatableTotal * (appliedDiscountPercent / 100))
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

  const vatableDiscountAmount = roundMoney(vatableTotal * (discountPercent / 100))
  const nonVatableDiscountAmount = roundMoney(nonVatableTotal * (discountPercent / 100))
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
export const getComputationLines = (
  result: VatCalculationResult,
  discountType: DiscountType = 'NONE',
  discountPercent = 0
): ComputationLine[] => {
  const lines: ComputationLine[] = []
  const isSeniorPwd = discountType === 'SENIOR' || discountType === 'PWD'
  const appliedPercent = discountType === 'NONE' ? 0 : discountPercent > 0 ? discountPercent : isSeniorPwd ? 20 : discountPercent
  const discountLabel = `Less: ${discountType} Discount (${appliedPercent}%)`

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
