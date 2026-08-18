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
}

export interface ReceiptItem {
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  isVatable: boolean;
}

export interface ReceiptData {
  saleId?: string;
  saleNumber: string;
  date: Date;
  items: ReceiptItem[];
  subtotal: number;
  discountType?: string;
  discountAmount?: number;
  discountIdNumber?: string;
  taxAmount: number;
  vatableSales?: number;
  nonVatableSales?: number;
  zeroRatedSales?: number;
  vatExemptSales?: number;
  totalAmount: number;
  paymentMethod: string;
  cashReceived?: number;
  changeGiven?: number;
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

export const formatPaymentMethodLabel = (paymentMethod: string) => paymentMethod.replace(/_/g, " ");
