import type { LoyaltyTxnType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSubscriptionWithPlan } from "@/lib/request-cache";
import { DEFAULT_PESOS_PER_POINT, DEFAULT_PESO_VALUE_PER_POINT } from "@/lib/loyalty-math";

export interface LoyaltyConfig {
  planHasIt: boolean; // the plan includes customer profiles & loyalty points
  enabled: boolean; // the owner switched loyalty points on
  active: boolean; // both: points are earned and can be used
  pesosPerPoint: number;
  pesoValuePerPoint: number;
}

// The plan flag and the owner's settings together. Loyalty is only live when
// the plan includes it AND the owner turned it on.
export async function getLoyaltyConfig(tenantId: string): Promise<LoyaltyConfig> {
  const [subscription, settings] = await Promise.all([
    getSubscriptionWithPlan(tenantId),
    prisma.loyaltySettings.findUnique({ where: { tenantId } }),
  ]);
  const planHasIt = Boolean(subscription?.plan.featureLoyalty);
  const enabled = Boolean(settings?.enabled);
  return {
    planHasIt,
    enabled,
    active: planHasIt && enabled,
    pesosPerPoint: settings ? Number(settings.pesosPerPoint) : DEFAULT_PESOS_PER_POINT,
    pesoValuePerPoint: settings ? Number(settings.pesoValuePerPoint) : DEFAULT_PESO_VALUE_PER_POINT,
  };
}

export class InsufficientPointsError extends Error {
  constructor(public balance: number) {
    super("Not enough points.");
  }
}

export class CustomerNotFoundError extends Error {
  constructor() {
    super("Customer not found.");
  }
}

interface ApplyPointsInput {
  tenantId: string;
  customerId: string;
  userId: string;
  type: LoyaltyTxnType;
  points: number; // + adds, − takes away
  saleId?: string | null;
  reason?: string | null;
  // true: a deduction larger than the balance takes it to 0 instead of failing
  // (voids, returns, owner adjustments of points already spent).
  // false: a deduction larger than the balance throws InsufficientPointsError
  // (using points to pay).
  clampAtZero?: boolean;
}

// The only way a customer's balance changes. Locks the customer row for the
// rest of the transaction, so two sales spending the same points can't both
// succeed, then writes the ledger row with the balance after it.
// Returns null when nothing moved (0 points, or a clamp on an empty balance).
export async function applyPoints(
  tx: Prisma.TransactionClient,
  input: ApplyPointsInput
): Promise<{ applied: number; balanceAfter: number } | null> {
  const points = Math.trunc(input.points);
  if (points === 0) return null;

  const rows = await tx.$queryRaw<{ loyaltyPoints: number }[]>`
    SELECT "loyaltyPoints" FROM "customers"
    WHERE "id" = ${input.customerId} AND "tenantId" = ${input.tenantId}
    FOR UPDATE`;
  if (rows.length === 0) throw new CustomerNotFoundError();
  const before = Number(rows[0].loyaltyPoints);

  let applied = points;
  if (before + points < 0) {
    if (!input.clampAtZero) throw new InsufficientPointsError(before);
    applied = -before;
  }
  if (applied === 0) return null;

  const balanceAfter = before + applied;
  await tx.customer.update({ where: { id: input.customerId }, data: { loyaltyPoints: balanceAfter } });
  await tx.loyaltyTransaction.create({
    data: {
      tenantId: input.tenantId,
      customerId: input.customerId,
      saleId: input.saleId ?? null,
      userId: input.userId,
      type: input.type,
      points: applied,
      balanceAfter,
      reason: input.reason?.trim() || null,
    },
  });
  return { applied, balanceAfter };
}
