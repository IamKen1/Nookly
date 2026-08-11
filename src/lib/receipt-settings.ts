import { prisma } from "@/lib/prisma";
import type { ReceiptStoreSettings } from "@/types/receipt";

const select = {
  storeName: true,
  receiptTitle: true,
  addressLine1: true,
  addressLine2: true,
  contactNumber: true,
  tin: true,
  permitNumber: true,
  accreditationNumber: true,
  serialNumberLabel: true,
  footerMessage: true,
  showVatBreakdown: true,
  showCashierName: true,
  showCustomerName: true,
  includeOrderRemarks: true,
} as const;

export const getReceiptSettings = async (tenantId: string): Promise<ReceiptStoreSettings> => {
  const existing = await prisma.receiptSettings.findUnique({ where: { tenantId }, select });
  if (existing) return existing;
  return prisma.receiptSettings.create({ data: { tenantId }, select });
};

const normalizeOptionalString = (value: unknown) => {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized || null;
};

const normalizeBoolean = (value: unknown, fallback: boolean) => (typeof value === "boolean" ? value : fallback);

export const updateReceiptSettings = async (
  tenantId: string,
  input: Partial<ReceiptStoreSettings>
): Promise<ReceiptStoreSettings> => {
  const current = await getReceiptSettings(tenantId);

  const payload = {
    storeName: typeof input.storeName === "string" && input.storeName.trim() ? input.storeName.trim() : current.storeName,
    receiptTitle: typeof input.receiptTitle === "string" && input.receiptTitle.trim() ? input.receiptTitle.trim() : current.receiptTitle,
    addressLine1: typeof input.addressLine1 === "string" && input.addressLine1.trim() ? input.addressLine1.trim() : current.addressLine1,
    addressLine2: normalizeOptionalString(input.addressLine2),
    contactNumber: normalizeOptionalString(input.contactNumber),
    tin: normalizeOptionalString(input.tin),
    permitNumber: normalizeOptionalString(input.permitNumber),
    accreditationNumber: normalizeOptionalString(input.accreditationNumber),
    serialNumberLabel: normalizeOptionalString(input.serialNumberLabel),
    footerMessage: typeof input.footerMessage === "string" && input.footerMessage.trim() ? input.footerMessage.trim() : current.footerMessage,
    showVatBreakdown: normalizeBoolean(input.showVatBreakdown, current.showVatBreakdown),
    showCashierName: normalizeBoolean(input.showCashierName, current.showCashierName),
    showCustomerName: normalizeBoolean(input.showCustomerName, current.showCustomerName),
    includeOrderRemarks: normalizeBoolean(input.includeOrderRemarks, current.includeOrderRemarks),
  };

  return prisma.receiptSettings.upsert({
    where: { tenantId },
    update: payload,
    create: { tenantId, ...payload },
    select,
  });
};
