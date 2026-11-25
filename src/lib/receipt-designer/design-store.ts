// Where a design is saved: the workspace design (receipt_templates, every
// branch) or one branch's own design (receipt_branch_templates). Both tables
// have the same fields, so the designer API works the same on either.
import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type Tx = Prisma.TransactionClient | PrismaClient;
// The fields both tables share (everything the designer reads or writes).
type DesignFields = Omit<Prisma.ReceiptTemplateUncheckedCreateInput, "id" | "tenantId" | "createdAt" | "updatedAt">;
export type DesignRow = Awaited<ReturnType<typeof prisma.receiptTemplate.findUnique>>;

export function designStore(tenantId: string, storeId: string | null) {
  if (!storeId) {
    return {
      find: (tx: Tx = prisma) => tx.receiptTemplate.findUnique({ where: { tenantId } }) as Promise<DesignRow>,
      upsert: (data: Partial<DesignFields>, tx: Tx = prisma) =>
        tx.receiptTemplate.upsert({ where: { tenantId }, update: data, create: { tenantId, ...data } }),
      update: (data: Partial<DesignFields>, tx: Tx = prisma) => tx.receiptTemplate.updateMany({ where: { tenantId }, data }),
    };
  }
  const where = { tenantId_storeId: { tenantId, storeId } };
  return {
    find: (tx: Tx = prisma) => tx.receiptBranchTemplate.findUnique({ where }) as unknown as Promise<DesignRow>,
    upsert: (data: Partial<DesignFields>, tx: Tx = prisma) =>
      tx.receiptBranchTemplate.upsert({ where, update: data, create: { tenantId, storeId, ...data } }),
    update: (data: Partial<DesignFields>, tx: Tx = prisma) => tx.receiptBranchTemplate.updateMany({ where: { tenantId, storeId }, data }),
  };
}

// A branch id from a request: one of this workspace's active branches, or null.
export async function branchOf(tenantId: string, value: unknown): Promise<{ id: string; name: string } | null | "invalid"> {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") return "invalid";
  const store = await prisma.store.findFirst({ where: { id: value, tenantId, isActive: true }, select: { id: true, name: true } });
  return store ?? "invalid";
}
