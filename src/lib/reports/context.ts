import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { startOfDatePH, endOfDatePH } from "@/lib/timezone";

const PH_OFFSET_MS = 8 * 60 * 60 * 1000;
export const DAY_MS = 24 * 60 * 60 * 1000;

export interface ReportContext {
  tenantId: string;
  // Branches the report covers; null = every branch.
  storeIds: string[] | null;
  stores: { id: string; name: string }[];
  primaryStoreId: string | null;
  // Philippine calendar days, inclusive: from 00:00 of fromKey to the end of toKey.
  fromKey: string;
  toKey: string;
  from: Date;
  to: Date;
  // Limits sale-based figures to what this user may see (own sales, etc.).
  saleVisibility: Prisma.SaleWhereInput;
}

export const money = (n: number) => Math.round(n * 100) / 100;
export const phDay = (d: Date) => new Date(d.getTime() + PH_OFFSET_MS).toISOString().slice(0, 10);
export const phHour = (d: Date) => new Date(d.getTime() + PH_OFFSET_MS).getUTCHours();
export const phWeekday = (d: Date) => new Date(d.getTime() + PH_OFFSET_MS).getUTCDay();
export const todayPH = () => phDay(new Date());

export async function buildContext(params: {
  tenantId: string;
  storeIds: string[] | null;
  fromKey: string;
  toKey: string;
  saleVisibility: Prisma.SaleWhereInput;
}): Promise<ReportContext> {
  const stores = await prisma.store.findMany({
    where: { tenantId: params.tenantId },
    orderBy: [{ isMainBranch: "desc" }, { createdAt: "asc" }],
    select: { id: true, name: true, isActive: true },
  });
  return {
    ...params,
    stores: stores.map((s) => ({ id: s.id, name: s.name })),
    primaryStoreId: stores[0]?.id ?? null,
    from: startOfDatePH(params.fromKey),
    to: endOfDatePH(params.toKey),
  };
}

export const storeName = (ctx: ReportContext, id: string | null | undefined) => ctx.stores.find((s) => s.id === id)?.name ?? "—";
export const storeWhere = (ctx: ReportContext) => (ctx.storeIds ? { storeId: { in: ctx.storeIds } } : {});

// Batches at the covered branches. Batches recorded before branches existed
// (no branch) belong to the primary branch.
export function batchWhere(ctx: ReportContext): Prisma.ProductBatchWhereInput {
  if (!ctx.storeIds) return {};
  const includesPrimary = ctx.primaryStoreId != null && ctx.storeIds.includes(ctx.primaryStoreId);
  return includesPrimary ? { OR: [{ storeId: { in: ctx.storeIds } }, { storeId: null }] } : { storeId: { in: ctx.storeIds } };
}

// Sales in the period the user may see. `kind`:
//  sales   — the original sales (completed, or later fully returned); not voids
//  returns — return records (negative amounts)
//  voids   — voided sales
export function saleWhere(ctx: ReportContext, kind: "sales" | "returns" | "voids" | "all"): Prisma.SaleWhereInput {
  const base: Prisma.SaleWhereInput = { tenantId: ctx.tenantId, ...storeWhere(ctx), saleDate: { gte: ctx.from, lt: ctx.to }, AND: [ctx.saleVisibility] };
  if (kind === "sales") return { ...base, originalSaleId: null, status: { in: ["COMPLETED", "RETURNED"] } };
  if (kind === "returns") return { ...base, originalSaleId: { not: null }, status: "RETURNED" };
  if (kind === "voids") return { ...base, status: "CANCELLED" };
  return base;
}

// Every Philippine day in the period, oldest first (capped at ~2 years).
export function daysIn(ctx: ReportContext) {
  const out: string[] = [];
  for (let t = startOfDatePH(ctx.fromKey).getTime(); t < ctx.to.getTime() && out.length < 800; t += DAY_MS) out.push(phDay(new Date(t)));
  return out;
}
