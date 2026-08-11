import { prisma } from "@/lib/prisma";
import type { NotificationSettings } from "@prisma/client";

export const getNotificationSettings = async (tenantId: string): Promise<NotificationSettings> => {
  const existing = await prisma.notificationSettings.findUnique({ where: { tenantId } });
  if (existing) return existing;
  return prisma.notificationSettings.create({ data: { tenantId } });
};

export const updateNotificationSettings = async (
  tenantId: string,
  input: Partial<
    Pick<
      NotificationSettings,
      | "emailNotificationsEnabled"
      | "saleNotificationsEnabled"
      | "lowStockNotificationsEnabled"
      | "outOfStockNotificationsEnabled"
      | "endOfDaySummaryEnabled"
      | "monthlySummaryEnabled"
      | "alertRecipientEmails"
    >
  >
): Promise<NotificationSettings> => {
  await getNotificationSettings(tenantId);
  return prisma.notificationSettings.update({ where: { tenantId }, data: input });
};

export const getAlertRecipients = async (tenantId: string): Promise<string[]> => {
  const settings = await getNotificationSettings(tenantId);
  if (settings.alertRecipientEmails) {
    return settings.alertRecipientEmails
      .split(",")
      .map((email) => email.trim())
      .filter(Boolean);
  }
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { ownerEmail: true } });
  return tenant?.ownerEmail ? [tenant.ownerEmail] : [];
};
