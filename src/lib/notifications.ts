import { sendAlertEmail } from "@/lib/email";
import { getAlertRecipients, getNotificationSettings } from "@/lib/notification-settings";
import { peso } from "@/lib/format";
import { formatPaymentMethodLabel, getReceiptFooterLines, getReceiptHeaderLines } from "@/types/receipt";
import type { ReceiptStoreSettings } from "@/types/receipt";

interface StockNotificationInput {
  tenantId: string;
  productName: string;
  categoryName?: string;
  previousStock: number;
  currentStock: number;
  minimumStock: number;
  reason: string;
}

interface SaleNotificationItem {
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

interface SaleNotificationInput {
  tenantId: string;
  saleNumber: string;
  saleDate?: Date;
  items: SaleNotificationItem[];
  subtotal: number;
  discountType?: string;
  discountAmount?: number;
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
  createdBy?: string;
  store: ReceiptStoreSettings;
}

const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const renderAlertHtml = ({
  title,
  badgeText,
  badgeColor,
  details,
}: {
  title: string;
  badgeText: string;
  badgeColor: string;
  details: Array<{ label: string; value: string }>;
}) => `
  <div style="font-family: Arial, Helvetica, sans-serif; max-width: 480px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
    <div style="background: #1e3a8a; color: #fff; padding: 14px 18px;">
      <div style="font-size: 16px; font-weight: 700;">${escapeHtml(title)}</div>
      <span style="display:inline-block; margin-top:6px; padding: 3px 8px; border-radius: 999px; font-size: 11px; font-weight: 700; background: ${badgeColor}; color: #fff;">${escapeHtml(
        badgeText
      )}</span>
    </div>
    <div style="padding: 16px 18px;">
      ${details
        .map(
          (d) =>
            `<div style="display:flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #f1f5f9; font-size: 13px;"><span style="color:#6b7280;">${escapeHtml(
              d.label
            )}</span><span style="font-weight:600; color:#111827;">${escapeHtml(d.value)}</span></div>`
        )
        .join("")}
    </div>
  </div>
`;

export const notifyStockThresholdReached = async ({
  tenantId,
  productName,
  categoryName,
  previousStock,
  currentStock,
  minimumStock,
  reason,
}: StockNotificationInput) => {
  const settings = await getNotificationSettings(tenantId);
  if (!settings.emailNotificationsEnabled) return;

  const crossedToOutOfStock = previousStock > 0 && currentStock <= 0;
  const crossedToLowStock = previousStock > minimumStock && currentStock > 0 && currentStock <= minimumStock;
  if (!crossedToOutOfStock && !crossedToLowStock) return;
  if (crossedToOutOfStock && !settings.outOfStockNotificationsEnabled) return;
  if (crossedToLowStock && !settings.lowStockNotificationsEnabled) return;

  const status = crossedToOutOfStock ? "OUT OF STOCK" : "LOW STOCK";
  const recipients = await getAlertRecipients(tenantId);

  await sendAlertEmail({
    to: recipients,
    subject: `[Nookly] ${status}: ${productName}`,
    text: [
      `Stock alert triggered by: ${reason}`,
      `Product: ${productName}`,
      `Category: ${categoryName || "N/A"}`,
      `Previous Stock: ${previousStock}`,
      `Current Stock: ${currentStock}`,
      `Minimum Stock: ${minimumStock}`,
      `Status: ${status}`,
    ].join("\n"),
    html: renderAlertHtml({
      title: `Inventory Alert: ${status}`,
      badgeText: status,
      badgeColor: crossedToOutOfStock ? "#dc2626" : "#d97706",
      details: [
        { label: "Product", value: productName },
        { label: "Category", value: categoryName || "N/A" },
        { label: "Previous Stock", value: String(previousStock) },
        { label: "Current Stock", value: String(currentStock) },
        { label: "Minimum Stock", value: String(minimumStock) },
        { label: "Triggered By", value: reason },
      ],
    }),
  });
};

const renderSaleReceiptHtml = (input: SaleNotificationInput) => {
  const {
    saleNumber,
    saleDate,
    items,
    subtotal,
    discountType,
    discountAmount,
    taxAmount,
    vatableSales,
    nonVatableSales,
    zeroRatedSales,
    vatExemptSales,
    totalAmount,
    paymentMethod,
    cashReceived,
    changeGiven,
    customer,
    cashier,
    orderRemarks,
    createdBy,
    store,
  } = input;

  const headerLines = getReceiptHeaderLines(store);
  const footerLines = getReceiptFooterLines(store);
  const date = saleDate ?? new Date();

  const row = (label: string, value: string, bold = false) => `
    <tr>
      <td style="padding: 4px 0; color: ${bold ? "#111827" : "#6b7280"}; font-weight: ${bold ? 700 : 400};">${escapeHtml(label)}</td>
      <td style="padding: 4px 0; text-align: right; font-weight: ${bold ? 700 : 600}; color: #111827;">${escapeHtml(value)}</td>
    </tr>`;

  return `
  <div style="font-family: Arial, Helvetica, sans-serif; max-width: 480px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
    <div style="background: #1e3a8a; color: #fff; padding: 14px 18px;">
      <div style="font-size: 16px; font-weight: 700;">${escapeHtml(headerLines[0] ?? store.storeName)}</div>
      ${headerLines
        .slice(1)
        .map((line) => `<div style="font-size: 11px; opacity: 0.85;">${escapeHtml(line)}</div>`)
        .join("")}
    </div>
    <div style="padding: 16px 18px;">
      <table style="width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 10px;">
        ${row("Receipt No.", saleNumber, true)}
        ${row("Date", date.toLocaleString("en-PH"))}
        ${row("Payment", formatPaymentMethodLabel(paymentMethod))}
        ${createdBy ? row("Cashier", createdBy) : cashier ? row("Cashier", `${cashier.firstName} ${cashier.lastName}`.trim()) : ""}
        ${customer ? row("Customer", `${customer.firstName} ${customer.lastName}`.trim()) : ""}
      </table>

      <table style="width: 100%; border-collapse: collapse; font-size: 13px; border-top: 1px solid #f1f5f9; border-bottom: 1px solid #f1f5f9; margin-bottom: 10px;">
        <tr><td colspan="2" style="padding: 6px 0 2px; font-size: 11px; font-weight: 700; color: #6b7280; text-transform: uppercase;">Item</td></tr>
        ${items
          .map(
            (item) => `
          <tr>
            <td style="padding: 3px 0; color: #111827;">
              ${escapeHtml(item.name)}<br/>
              <span style="color: #6b7280; font-size: 11px;">Qty ${item.quantity} x ${escapeHtml(peso(item.unitPrice))}</span>
            </td>
            <td style="padding: 3px 0; text-align: right; vertical-align: top; font-weight: 600; color: #111827;">${escapeHtml(peso(item.totalPrice))}</td>
          </tr>`
          )
          .join("")}
      </table>

      <table style="width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 10px;">
        ${row("Subtotal", peso(subtotal))}
        ${discountAmount && discountAmount > 0 ? row(discountType && discountType !== "NONE" ? `${discountType} Discount` : "Discount", `-${peso(discountAmount)}`) : ""}
        ${row("TOTAL", peso(totalAmount), true)}
      </table>

      ${
        store.showVatBreakdown && (vatableSales || nonVatableSales || taxAmount > 0 || vatExemptSales)
          ? `
      <table style="width: 100%; border-collapse: collapse; font-size: 12px; border-top: 1px dashed #d1d5db; padding-top: 4px; margin-bottom: 10px;">
        <tr><td colspan="2" style="padding: 6px 0 2px; font-size: 11px; font-weight: 700; color: #6b7280; text-transform: uppercase;">VAT Breakdown</td></tr>
        ${vatExemptSales ? row("VAT-Exempt Sales", peso(vatExemptSales)) : ""}
        ${row("VAT Sales", peso(vatableSales ?? 0))}
        ${row("12% VAT Sales", peso(taxAmount))}
        ${row("Non-VAT Sales", peso(nonVatableSales ?? 0))}
        ${row("Zero Rated Sales", peso(zeroRatedSales ?? 0))}
      </table>`
          : ""
      }

      <table style="width: 100%; border-collapse: collapse; font-size: 13px; border-top: 1px solid #f1f5f9; padding-top: 4px;">
        ${cashReceived ? row("Cash", peso(cashReceived)) : ""}
        ${changeGiven && changeGiven > 0 ? row("Change", peso(changeGiven)) : ""}
      </table>

      ${orderRemarks?.trim() ? `<div style="margin-top: 10px; font-size: 12px; color: #374151;"><strong>Remarks:</strong> ${escapeHtml(orderRemarks.trim())}</div>` : ""}

      <div style="margin-top: 14px; padding-top: 10px; border-top: 1px solid #f1f5f9; font-size: 11px; color: #9ca3af; text-align: center;">
        ${footerLines.map((line) => `<div>${escapeHtml(line)}</div>`).join("")}
      </div>
    </div>
  </div>`;
};

const renderSaleReceiptText = (input: SaleNotificationInput) => {
  const {
    saleNumber,
    saleDate,
    items,
    subtotal,
    discountType,
    discountAmount,
    taxAmount,
    vatableSales,
    nonVatableSales,
    zeroRatedSales,
    vatExemptSales,
    totalAmount,
    paymentMethod,
    cashReceived,
    changeGiven,
    customer,
    cashier,
    orderRemarks,
    createdBy,
    store,
  } = input;

  const headerLines = getReceiptHeaderLines(store);
  const footerLines = getReceiptFooterLines(store);
  const date = saleDate ?? new Date();

  const lines = [
    ...headerLines,
    "",
    `Receipt No.: ${saleNumber}`,
    `Date: ${date.toLocaleString("en-PH")}`,
    `Payment: ${formatPaymentMethodLabel(paymentMethod)}`,
    createdBy ? `Cashier: ${createdBy}` : `Cashier: ${cashier.firstName} ${cashier.lastName}`.trim(),
    customer ? `Customer: ${customer.firstName} ${customer.lastName}`.trim() : "",
    "",
    "ITEMS",
    ...items.map((item) => `${item.name} — Qty ${item.quantity} x ${peso(item.unitPrice)} = ${peso(item.totalPrice)}`),
    "",
    `Subtotal: ${peso(subtotal)}`,
    discountAmount && discountAmount > 0
      ? `${discountType && discountType !== "NONE" ? `${discountType} Discount` : "Discount"}: -${peso(discountAmount)}`
      : "",
    `TOTAL: ${peso(totalAmount)}`,
  ];

  if (store.showVatBreakdown && (vatableSales || nonVatableSales || taxAmount > 0 || vatExemptSales)) {
    lines.push(
      "",
      "VAT BREAKDOWN",
      vatExemptSales ? `VAT-Exempt Sales: ${peso(vatExemptSales)}` : "",
      `VAT Sales: ${peso(vatableSales ?? 0)}`,
      `12% VAT Sales: ${peso(taxAmount)}`,
      `Non-VAT Sales: ${peso(nonVatableSales ?? 0)}`,
      `Zero Rated Sales: ${peso(zeroRatedSales ?? 0)}`
    );
  }

  if (cashReceived) lines.push(`Cash: ${peso(cashReceived)}`);
  if (changeGiven && changeGiven > 0) lines.push(`Change: ${peso(changeGiven)}`);
  if (orderRemarks?.trim()) lines.push("", `Remarks: ${orderRemarks.trim()}`);

  lines.push("", ...footerLines);

  return lines.filter((line) => line !== undefined).join("\n");
};

export const notifySaleCreated = async (input: SaleNotificationInput) => {
  const { tenantId, saleNumber } = input;
  const settings = await getNotificationSettings(tenantId);
  if (!settings.emailNotificationsEnabled || !settings.saleNotificationsEnabled) return;

  const recipients = await getAlertRecipients(tenantId);

  await sendAlertEmail({
    to: recipients,
    subject: `[Nookly] Sale Receipt: ${saleNumber}`,
    text: renderSaleReceiptText(input),
    html: renderSaleReceiptHtml(input),
  });
};
