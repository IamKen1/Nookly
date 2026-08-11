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
  }
}
