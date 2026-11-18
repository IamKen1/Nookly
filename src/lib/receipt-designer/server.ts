import { prisma } from "@/lib/prisma";
import { getSubscriptionWithPlan } from "@/lib/request-cache";
import type { Template } from "./types";
import { sanitizeTemplate } from "./validate";

// The design receipts should print with, or null for the standard receipt.
// Only when the plan includes the designer AND the owner chose "Use this
// design"; a saved design that somehow fails validation also falls back.
export async function getActiveReceiptTemplate(tenantId: string): Promise<Template | null> {
  const [subscription, row] = await Promise.all([
    getSubscriptionWithPlan(tenantId),
    prisma.receiptTemplate.findUnique({ where: { tenantId } }),
  ]);
  if (!subscription?.plan.featureReceiptDesigner || !row?.enabled) return null;
  const { template, errors } = sanitizeTemplate({
    version: row.version,
    paperWidth: row.paperWidth,
    printMode: row.printMode,
    theme: row.theme,
    blocks: row.blocks,
  });
  if (errors.length > 0 || template.blocks.length === 0) return null;
  return template;
}
