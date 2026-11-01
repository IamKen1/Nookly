import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type Tx = Prisma.TransactionClient;
const DAY_MS = 24 * 60 * 60 * 1000;
const PH_OFFSET_MS = 8 * 60 * 60 * 1000;
const money = (n: number) => Math.round(n * 100) / 100;

export const PAYMENT_METHODS = ["CASH", "BANK_TRANSFER", "CHECK", "E_WALLET"] as const;
export const PAYMENT_METHOD_LABELS: Record<string, string> = { CASH: "Cash", BANK_TRANSFER: "Bank transfer", CHECK: "Check", E_WALLET: "E-wallet" };
export const RETURN_REASONS: Record<string, string> = {
  EXPIRED: "Expired",
  NEAR_EXPIRY: "Near expiry",
  DAMAGED: "Damaged",
  WRONG_ITEM: "Wrong item",
  OTHER: "Other",
};
export const RETURN_SETTLEMENTS: Record<string, string> = {
  CREDIT: "Credit (less from what we owe)",
  REPLACEMENT: "Replacement",
  REFUND: "Refund",
};

// When a delivery's payment falls due under the supplier's terms.
export const dueDateFor = (receivedAt: Date, termsDays: number) => new Date(receivedAt.getTime() + Math.max(0, termsDays) * DAY_MS);

// Applies a payment or return credit to the supplier's unpaid deliveries — the
// ones named first (in that order), then the oldest due. Returns what's left
// over, which stays as credit toward the next delivery.
export async function allocateCredit(
  tx: Tx,
  params: { tenantId: string; supplierId: string; amount: number; paymentId?: string; returnId?: string; preferReceivingIds?: string[] }
) {
  let remaining = money(params.amount);
  if (remaining <= 0) return 0;
  const deliveries = await tx.receiving.findMany({
    where: { tenantId: params.tenantId, supplierId: params.supplierId },
    orderBy: [{ dueDate: "asc" }, { receivedAt: "asc" }],
    select: { id: true, totalCost: true, amountPaid: true },
  });
  const preferred = params.preferReceivingIds ?? [];
  const ordered = [
    ...preferred.map((id) => deliveries.find((d) => d.id === id)).filter((d): d is (typeof deliveries)[number] => Boolean(d)),
    ...deliveries.filter((d) => !preferred.includes(d.id)),
  ];
  for (const d of ordered) {
    if (remaining <= 0) break;
    const open = money(Number(d.totalCost) - Number(d.amountPaid));
    if (open <= 0) continue;
    const take = money(Math.min(open, remaining));
    await tx.supplierAllocation.create({ data: { receivingId: d.id, paymentId: params.paymentId, returnId: params.returnId, amount: take } });
    await tx.receiving.update({ where: { id: d.id }, data: { amountPaid: { increment: take } } });
    remaining = money(remaining - take);
  }
  return remaining;
}

// Credit not yet applied to any delivery: payments (not voided) and credit
// returns, minus what they've already settled.
async function unappliedCredits(tx: Tx, tenantId: string, supplierId: string) {
  const [payments, returns] = await Promise.all([
    tx.supplierPayment.findMany({
      where: { tenantId, supplierId, voidedAt: null },
      orderBy: { paidAt: "asc" },
      select: { id: true, amount: true, allocations: { select: { amount: true } } },
    }),
    tx.supplierReturn.findMany({
      where: { tenantId, supplierId, settlement: "CREDIT" },
      orderBy: { returnedAt: "asc" },
      select: { id: true, totalCost: true, allocations: { select: { amount: true } } },
    }),
  ]);
  const used = (a: { amount: Prisma.Decimal }[]) => a.reduce((s, x) => s + Number(x.amount), 0);
  return [
    ...payments.map((p) => ({ paymentId: p.id, left: money(Number(p.amount) - used(p.allocations)) })),
    ...returns.map((r) => ({ returnId: r.id, left: money(Number(r.totalCost) - used(r.allocations)) })),
  ].filter((c) => c.left > 0);
}

// After a new delivery (or a voided payment), leftover credit settles what's open.
export async function applyUnappliedCredits(tx: Tx, tenantId: string, supplierId: string) {
  for (const c of await unappliedCredits(tx, tenantId, supplierId)) {
    const left = await allocateCredit(tx, { tenantId, supplierId, amount: c.left, paymentId: "paymentId" in c ? c.paymentId : undefined, returnId: "returnId" in c ? c.returnId : undefined });
    if (left === c.left) break; // nothing open any more
  }
}

// Voids a payment: what it settled becomes unpaid again, then any other
// leftover credit is re-applied.
export async function voidPayment(tx: Tx, tenantId: string, paymentId: string) {
  const payment = await tx.supplierPayment.findFirst({ where: { id: paymentId, tenantId }, include: { allocations: true } });
  if (!payment || payment.voidedAt) return null;
  for (const a of payment.allocations) {
    await tx.receiving.update({ where: { id: a.receivingId }, data: { amountPaid: { decrement: a.amount } } });
  }
  await tx.supplierAllocation.deleteMany({ where: { paymentId } });
  const voided = await tx.supplierPayment.update({ where: { id: paymentId }, data: { voidedAt: new Date() } });
  await applyUnappliedCredits(tx, tenantId, payment.supplierId);
  return voided;
}

export const AGING_BUCKETS = [
  { key: "current", label: "Not yet due" },
  { key: "d1_30", label: "1–30 days" },
  { key: "d31_60", label: "31–60 days" },
  { key: "d61_90", label: "61–90 days" },
  { key: "d90", label: "Over 90 days" },
] as const;
type BucketKey = (typeof AGING_BUCKETS)[number]["key"];

const startOfTodayPH = () => {
  const ph = new Date(Date.now() + PH_OFFSET_MS);
  return new Date(Date.UTC(ph.getUTCFullYear(), ph.getUTCMonth(), ph.getUTCDate()) - PH_OFFSET_MS);
};

const bucketFor = (dueDate: Date | null, today: Date): BucketKey => {
  if (!dueDate || dueDate >= today) return "current";
  const days = Math.floor((today.getTime() - dueDate.getTime()) / DAY_MS) + 1;
  return days <= 30 ? "d1_30" : days <= 60 ? "d31_60" : days <= 90 ? "d61_90" : "d90";
};

// What the store owes each supplier: open deliveries by age, overdue, due this
// week, unused credit, and the net balance.
export async function supplierBalances(tenantId: string, supplierIds?: string[]) {
  const supplierWhere = supplierIds ? { in: supplierIds } : { not: null };
  const [deliveries, payments, returns, allocations] = await Promise.all([
    prisma.receiving.findMany({
      where: { tenantId, supplierId: supplierWhere as never },
      select: { supplierId: true, totalCost: true, amountPaid: true, dueDate: true, receivedAt: true },
    }),
    prisma.supplierPayment.groupBy({ by: ["supplierId"], where: { tenantId, voidedAt: null, ...(supplierIds ? { supplierId: { in: supplierIds } } : {}) }, _sum: { amount: true } }),
    prisma.supplierReturn.groupBy({
      by: ["supplierId"],
      where: { tenantId, settlement: "CREDIT", ...(supplierIds ? { supplierId: { in: supplierIds } } : {}) },
      _sum: { totalCost: true },
    }),
    prisma.supplierAllocation.findMany({
      where: { receiving: { tenantId, ...(supplierIds ? { supplierId: { in: supplierIds } } : {}) } },
      select: { amount: true, receiving: { select: { supplierId: true } } },
    }),
  ]);

  const today = startOfTodayPH();
  const weekAhead = new Date(today.getTime() + 8 * DAY_MS);
  type Row = { purchases: number; open: number; overdue: number; dueThisWeek: number; credit: number; lastDelivery: Date | null; aging: Record<BucketKey, number> };
  const rows = new Map<string, Row>();
  const row = (id: string) => {
    let r = rows.get(id);
    if (!r) {
      r = { purchases: 0, open: 0, overdue: 0, dueThisWeek: 0, credit: 0, lastDelivery: null, aging: { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90: 0 } };
      rows.set(id, r);
    }
    return r;
  };

  for (const d of deliveries) {
    const r = row(d.supplierId!);
    r.purchases += Number(d.totalCost);
    if (!r.lastDelivery || d.receivedAt > r.lastDelivery) r.lastDelivery = d.receivedAt;
    const open = money(Number(d.totalCost) - Number(d.amountPaid));
    if (open <= 0) continue;
    r.open += open;
    const bucket = bucketFor(d.dueDate, today);
    r.aging[bucket] += open;
    if (bucket !== "current") r.overdue += open;
    else if (d.dueDate && d.dueDate < weekAhead) r.dueThisWeek += open;
  }
  const allocatedBySupplier = new Map<string, number>();
  for (const a of allocations) allocatedBySupplier.set(a.receiving.supplierId!, (allocatedBySupplier.get(a.receiving.supplierId!) ?? 0) + Number(a.amount));
  for (const p of payments) row(p.supplierId).credit += Number(p._sum.amount ?? 0);
  for (const rt of returns) row(rt.supplierId).credit += Number(rt._sum.totalCost ?? 0);
  for (const [id, r] of rows) r.credit = money(Math.max(0, r.credit - (allocatedBySupplier.get(id) ?? 0)));

  return new Map(
    [...rows].map(([id, r]) => [
      id,
      {
        purchases: money(r.purchases),
        open: money(r.open),
        overdue: money(r.overdue),
        dueThisWeek: money(r.dueThisWeek),
        credit: r.credit,
        balance: money(r.open - r.credit),
        lastDelivery: r.lastDelivery?.toISOString() ?? null,
        aging: Object.fromEntries(Object.entries(r.aging).map(([k, v]) => [k, money(v)])) as Record<BucketKey, number>,
      },
    ])
  );
}
export type SupplierBalance = NonNullable<Awaited<ReturnType<typeof supplierBalances>> extends Map<string, infer V> ? V : never>;

// Short, sequential number per day: PREFIX-yyyymmdd-0001 (Philippine date).
export async function nextDailyNumber(tx: Tx, tenantId: string, prefix: "RTS") {
  const key = new Date(Date.now() + PH_OFFSET_MS).toISOString().slice(0, 10).replace(/-/g, "");
  const start = `${prefix}-${key}-`;
  const last = await tx.supplierReturn.findFirst({ where: { tenantId, returnNumber: { startsWith: start } }, orderBy: { returnNumber: "desc" }, select: { returnNumber: true } });
  const seq = last ? parseInt(last.returnNumber.slice(start.length), 10) || 0 : 0;
  return `${start}${String(seq + 1).padStart(4, "0")}`;
}
