import { sendAlertEmail } from "@/lib/email";
import { getAlertRecipients, getNotificationSettings } from "@/lib/notification-settings";
import { peso } from "@/lib/format";

interface StockNotificationInput {
  tenantId: string;
  productName: string;
  categoryName?: string;
  previousStock: number;
  currentStock: number;
  minimumStock: number;
  reason: string;
}

interface SaleNotificationInput {
  tenantId: string;
  saleNumber: string;
  totalAmount: number;
  itemCount: number;
  createdBy?: string;
  saleDate?: Date;
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

export const notifySaleCreated = async ({
  tenantId,
  saleNumber,
  totalAmount,
  itemCount,
  createdBy,
  saleDate,
}: SaleNotificationInput) => {
  const settings = await getNotificationSettings(tenantId);
  if (!settings.emailNotificationsEnabled || !settings.saleNotificationsEnabled) return;

  const recipients = await getAlertRecipients(tenantId);

  await sendAlertEmail({
    to: recipients,
    subject: `[Nookly] Sale Created: ${saleNumber}`,
    text: [
      `New sale recorded.`,
      `Sale No.: ${saleNumber}`,
      `Date: ${(saleDate ?? new Date()).toLocaleString("en-PH")}`,
      `Items: ${itemCount}`,
      `Total: ${peso(totalAmount)}`,
      createdBy ? `Recorded by: ${createdBy}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
    html: renderAlertHtml({
      title: "New Sale Recorded",
      badgeText: "Sale Created",
      badgeColor: "#2563eb",
      details: [
        { label: "Sale No.", value: saleNumber },
        { label: "Items", value: String(itemCount) },
        { label: "Total", value: peso(totalAmount) },
        ...(createdBy ? [{ label: "Recorded by", value: createdBy }] : []),
      ],
    }),
  });
};
