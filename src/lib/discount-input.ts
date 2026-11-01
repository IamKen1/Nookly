import { prisma } from "@/lib/prisma";

const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

// Checks a discount from the Settings form. Dates are whole Philippine days.
export async function parseDiscountBody(tenantId: string, body: Record<string, unknown>) {
  const name = typeof body.name === "string" ? body.name.trim().replace(/\s+/g, " ").slice(0, 40) : "";
  if (!name) return { error: "Give the discount a name." };

  const kind = body.kind === "FIXED" ? "FIXED" : "PERCENT";
  const value = Number(body.value);
  if (!Number.isFinite(value) || value <= 0) return { error: "Enter how much the discount takes off." };
  if (kind === "PERCENT" && value > 100) return { error: "A percentage can't be more than 100." };

  const maxRaw = body.maxAmount;
  const maxAmount = maxRaw === null || maxRaw === undefined || maxRaw === "" ? null : Number(maxRaw);
  if (maxAmount !== null && (!Number.isFinite(maxAmount) || maxAmount <= 0)) return { error: "The maximum must be more than ₱0." };

  const startsOn = body.startsOn ? (isDate(body.startsOn) ? body.startsOn : undefined) : null;
  const endsOn = body.endsOn ? (isDate(body.endsOn) ? body.endsOn : undefined) : null;
  if (startsOn === undefined || endsOn === undefined) return { error: "A date is not valid." };
  if (startsOn && endsOn && endsOn < startsOn) return { error: "The end date is before the start date." };

  const requested = Array.isArray(body.storeIds) ? body.storeIds.filter((v): v is string => typeof v === "string") : [];
  const stores = requested.length
    ? await prisma.store.findMany({ where: { tenantId, id: { in: requested } }, select: { id: true } })
    : [];

  return {
    data: {
      name,
      kind,
      value: Math.round(value * 100) / 100,
      maxAmount: kind === "PERCENT" && maxAmount !== null ? Math.round(maxAmount * 100) / 100 : null,
      vatExempt: Boolean(body.vatExempt),
      asksForId: Boolean(body.asksForId),
      isActive: body.isActive === undefined ? true : Boolean(body.isActive),
      startsOn: startsOn ? new Date(startsOn) : null,
      endsOn: endsOn ? new Date(endsOn) : null,
      storeIds: stores.map((s) => s.id),
    },
  };
}
