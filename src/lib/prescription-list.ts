import type { Prisma } from "@prisma/client";
import { startOfDatePH, endOfDatePH } from "@/lib/timezone";

const isDate = (v: string | null): v is string => Boolean(v && /^\d{4}-\d{2}-\d{2}$/.test(v));

// Filters shared by the Prescriptions list and its Excel export:
// ?from&to (prescription date, Philippine days), ?q (customer name or Rx #),
// ?status (one or more, comma-separated).
export function prescriptionWhere(tenantId: string, params: URLSearchParams): Prisma.PrescriptionWhereInput {
  const from = params.get("from");
  const to = params.get("to");
  const q = params.get("q")?.trim();
  const statuses = (params.get("status") ?? "").split(",").filter(Boolean);
  const customerId = params.get("customerId");

  const where: Prisma.PrescriptionWhereInput = { tenantId };
  if (statuses.length) where.status = { in: statuses as never[] };
  if (customerId) where.customerId = customerId;
  if (isDate(from) || isDate(to)) {
    where.originalDate = { ...(isDate(from) ? { gte: startOfDatePH(from) } : {}), ...(isDate(to) ? { lt: endOfDatePH(to) } : {}) };
  }
  if (q) {
    const words = q.split(/\s+/).filter(Boolean);
    where.OR = [
      { prescriptionNumber: { contains: q, mode: "insensitive" } },
      // "Juan Dela Cruz" matches when every word is in the first or last name.
      { AND: words.map((w) => ({ customer: { OR: [{ firstName: { contains: w, mode: "insensitive" } }, { lastName: { contains: w, mode: "insensitive" } }] } })) },
    ];
  }
  return where;
}

// What the screen and the spreadsheet call each status.
export const PRESCRIPTION_STATUS_LABELS: Record<string, string> = {
  FILLED: "Fully served",
  PARTIAL: "Partially served",
  PENDING: "Not yet served",
  CANCELLED: "Cancelled",
  EXPIRED: "Expired",
};
