export interface ReceiptStoreSettings {
  storeName: string;
  receiptTitle: string;
  addressLine1: string;
  addressLine2?: string | null;
  contactNumber?: string | null;
  tin?: string | null;
  permitNumber?: string | null;
  accreditationNumber?: string | null;
  serialNumberLabel?: string | null;
  footerMessage: string;
  showVatBreakdown: boolean;
  showCashierName: boolean;
  showCustomerName: boolean;
  includeOrderRemarks: boolean;
  // Used by the receipt designer only.
  logoUrl?: string | null;
}

export interface ReceiptItem {
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  isVatable: boolean;
  genericName?: string | null; // receipt designer only
}

export interface ReceiptData {
  saleId?: string;
  saleNumber: string;
  date: Date;
  branchName?: string | null; // receipt designer only
  storeId?: string | null; // receipt designer only (branch conditions)
  items: ReceiptItem[];
  subtotal: number;
  discountType?: string;
  // As saved on the sale; absent on sales made before discounts were configurable.
  discountName?: string | null;
  discountRate?: string | null;
  discountVatExempt?: boolean;
  discountAmount?: number;
  discountIdNumber?: string;
  discountHolderName?: string;
  taxAmount: number;
  vatableSales?: number;
  nonVatableSales?: number;
  zeroRatedSales?: number;
  vatExemptSales?: number;
  // Split-out computation breakdown (persisted on the Sale) — lets the receipt
  // show its own +/- derivation instead of just the rolled-up endpoints.
  vatableGross?: number;
  nonVatableGross?: number;
  vatableDiscountAmount?: number;
  nonVatableDiscountAmount?: number;
  vatRemovedFromVatable?: number;
  totalAmount: number;
  paymentMethod: string;
  paymentProvider?: string | null;
  paymentReference?: string | null;
  cashReceived?: number;
  changeGiven?: number;
  // Loyalty points on this sale, as saved with it. Absent when no points moved.
  loyalty?: {
    pointsRedeemed: number;
    pointsAmount: number; // peso value of the points used
    pointsEarned: number;
    balanceAfter: number | null; // the customer's balance right after this sale
  };
  customer?: { firstName: string; lastName: string };
  cashier: { firstName: string; lastName: string };
  orderRemarks?: string | null;
  store: ReceiptStoreSettings;
}

export const splitReceiptLines = (...values: Array<string | null | undefined>) =>
  values
    .flatMap((value) => String(value ?? "").split(/\r?\n/g))
    .map((line) => line.trim())
    .filter(Boolean);

export const getReceiptHeaderLines = (store: ReceiptStoreSettings) => {
  const lines = [...splitReceiptLines(store.storeName), ...splitReceiptLines(store.addressLine1, store.addressLine2)];
  if (store.contactNumber) lines.push(`Contact: ${store.contactNumber}`);
  if (store.tin) lines.push(`TIN: ${store.tin}`);
  if (store.permitNumber) lines.push(`Permit: ${store.permitNumber}`);
  if (store.accreditationNumber) lines.push(`Accreditation: ${store.accreditationNumber}`);
  if (store.serialNumberLabel) lines.push(`Serial: ${store.serialNumberLabel}`);
  return lines;
};

// Fixed, non-editable — Nookly is not (yet) BIR-accredited, so every receipt must
// carry this disclaimer regardless of tenant footer customization.
export const NOT_BIR_ACCREDITED_NOTICE = "This receipt is not a BIR-accredited Official Receipt / Sales Invoice.";

export const getReceiptFooterLines = (store: ReceiptStoreSettings) =>
  [store.footerMessage, NOT_BIR_ACCREDITED_NOTICE].map((line) => line?.trim()).filter(Boolean) as string[];

// E-wallet sales print the wallet name (GCASH, MAYA) since that is what the customer used.
export const formatPaymentMethodLabel = (paymentMethod: string, provider?: string | null) =>
  paymentMethod === "E_WALLET" ? (provider ? provider.toUpperCase() : "E-WALLET") : paymentMethod.replace(/_/g, " ");
