import type { Discount } from "@prisma/client";
import { prisma } from "@/lib/prisma";
export { discountCalcInput, discountDisplay, discountRateText } from "@/lib/discount-math";

const PH_OFFSET_MS = 8 * 60 * 60 * 1000;

// The discounts every workspace starts with — the same ones checkout offered
// before discounts were configurable. SC/PWD are set by law.
export const DEFAULT_DISCOUNTS = [
  { code: "SENIOR", name: "Senior citizen", value: 20, vatExempt: true, asksForId: true, isSystem: true, sortOrder: 1 },
  { code: "PWD", name: "PWD", value: 20, vatExempt: true, asksForId: true, isSystem: true, sortOrder: 2 },
  { code: "STUDENT", name: "Student", value: 10, vatExempt: false, asksForId: true, isSystem: false, sortOrder: 3 },
  { code: "EMPLOYEE", name: "Employee", value: 15, vatExempt: false, asksForId: false, isSystem: false, sortOrder: 4 },
];

// Workspaces created after discounts became configurable get the defaults on first use.
export async function ensureDefaultDiscounts(tenantId: string) {
  const count = await prisma.discount.count({ where: { tenantId } });
  if (count > 0) return;
  await prisma.discount.createMany({
    data: DEFAULT_DISCOUNTS.map((d) => ({ ...d, tenantId, kind: "PERCENT" })),
    skipDuplicates: true,
  });
}

export const todayPH = () => new Date(Date.now() + PH_OFFSET_MS).toISOString().slice(0, 10);
const dayOf = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

// Usable at this branch today: active, within its dates, and offered here.
export function isDiscountAvailable(d: Pick<Discount, "isActive" | "startsOn" | "endsOn" | "storeIds">, storeId: string | null, today = todayPH()) {
  if (!d.isActive) return false;
  const start = dayOf(d.startsOn);
  const end = dayOf(d.endsOn);
  if (start && today < start) return false;
  if (end && today > end) return false;
  if (d.storeIds.length > 0 && (!storeId || !d.storeIds.includes(storeId))) return false;
  return true;
}

export function serializeDiscount(d: Discount) {
  return {
    id: d.id,
    code: d.code,
    name: d.name,
    kind: d.kind,
    value: Number(d.value),
    maxAmount: d.maxAmount != null ? Number(d.maxAmount) : null,
    vatExempt: d.vatExempt,
    asksForId: d.asksForId,
    isSystem: d.isSystem,
    isActive: d.isActive,
    startsOn: dayOf(d.startsOn),
    endsOn: dayOf(d.endsOn),
    storeIds: d.storeIds,
    sortOrder: d.sortOrder,
  };
}
export type DiscountDTO = ReturnType<typeof serializeDiscount>;

// Short, stable code saved on each sale, derived from the name ("Loyalty card" → LOYALTY_CARD).
export function codeFromName(name: string) {
  return (
    name
      .toUpperCase()
      .normalize("NFKD")
      .replace(/[^A-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 24) || "DISCOUNT"
  );
}
