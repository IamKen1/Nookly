import { prisma } from "@/lib/prisma";
import { getSubscriptionWithPlan } from "@/lib/request-cache";
import type { Template } from "./types";
import { sanitizeTemplate } from "./validate";

type Row = { enabled: boolean; version: number; paperWidth: number; printMode: string; theme: unknown; blocks: unknown };

// A saved design that somehow fails validation falls back like no design.
function usable(row: Row | null): Template | null {
  if (!row?.enabled) return null;
  const { template, errors } = sanitizeTemplate({ version: row.version, paperWidth: row.paperWidth, printMode: row.printMode, theme: row.theme, blocks: row.blocks });
  return errors.length > 0 || template.blocks.length === 0 ? null : template;
}

// The design a sale's receipt prints with, or null for the standard receipt.
// Only when the plan includes the designer and the owner chose "Use this
// design": the branch's own design if it has one in use, else the workspace's.
export async function getActiveReceiptTemplate(tenantId: string, storeId?: string | null): Promise<Template | null> {
  const [subscription, row, branchRow] = await Promise.all([
    getSubscriptionWithPlan(tenantId),
    prisma.receiptTemplate.findUnique({ where: { tenantId } }),
    storeId ? prisma.receiptBranchTemplate.findUnique({ where: { tenantId_storeId: { tenantId, storeId } } }) : null,
  ]);
  if (!subscription?.plan.featureReceiptDesigner) return null;
  return usable(branchRow) ?? usable(row);
}
