import { prisma } from "@/lib/prisma";
import type { PendingOrderItem } from "@/lib/pending-orders";

// A prescription entered by whoever took an order, carried on the order until
// the cashier takes payment. Either an existing prescription being continued
// or a new one (the same draft checkout sends); it only becomes a real
// prescription at payment, so a cancelled order leaves nothing behind.
export interface OrderPrescriptionDraft {
  customerId?: string;
  newCustomer?: { firstName: string; lastName: string; phone?: string };
  doctorId?: string;
  newDoctor?: { firstName: string; lastName: string; licenseNumber?: string };
  writtenDate: string;
  instructions?: string;
  prescribedQuantities?: Record<string, number>;
}

export interface OrderPrescription {
  prescriptionId?: string;
  prescriptionDraft?: OrderPrescriptionDraft;
  // What the cashier sees, e.g. "Juan Dela Cruz · Dr. Ana Santos".
  label: string;
}

const text = (v: unknown, max = 100) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const fullName = (p: { firstName: string; lastName: string }) => `${p.firstName} ${p.lastName}`.trim();

// Reads PendingOrder.prescription (JSON) back; anything malformed counts as none.
export function readOrderPrescription(value: unknown): OrderPrescription | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (typeof v.label !== "string") return null;
  if (typeof v.prescriptionId === "string" && v.prescriptionId) return { prescriptionId: v.prescriptionId, label: v.label };
  if (v.prescriptionDraft && typeof v.prescriptionDraft === "object") {
    return { prescriptionDraft: v.prescriptionDraft as OrderPrescriptionDraft, label: v.label };
  }
  return null;
}

// Checks a prescription sent with an order the same way checkout would, and
// returns what to store on the order — or the error to show the order taker.
export async function prepareOrderPrescription(
  tenantId: string,
  input: unknown,
  items: PendingOrderItem[],
  requiresRx: Map<string, boolean>
): Promise<{ value: OrderPrescription } | { error: string }> {
  if (!input || typeof input !== "object") return { error: "The prescription is incomplete." };
  const body = input as Record<string, unknown>;

  if (typeof body.prescriptionId === "string" && body.prescriptionId) {
    const rx = await prisma.prescription.findFirst({
      where: { id: body.prescriptionId, tenantId },
      select: { id: true, prescriptionNumber: true, status: true, customer: { select: { firstName: true, lastName: true } } },
    });
    if (!rx) return { error: "Prescription not found." };
    if (rx.status !== "PENDING" && rx.status !== "PARTIAL") return { error: `Prescription ${rx.prescriptionNumber} is already ${rx.status === "FILLED" ? "fully served" : rx.status.toLowerCase()}.` };
    return { value: { prescriptionId: rx.id, label: `${rx.prescriptionNumber} · ${fullName(rx.customer)}` } };
  }

  const d = (body.prescriptionDraft ?? null) as Record<string, unknown> | null;
  if (!d || typeof d !== "object") return { error: "The prescription is incomplete." };

  const writtenDate = text(d.writtenDate, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(writtenDate) || Number.isNaN(new Date(writtenDate).getTime())) return { error: "The prescription date is required." };

  const person = async (kind: "customer" | "doctor") => {
    const id = text(d[`${kind}Id`], 40);
    if (id) {
      const found =
        kind === "customer"
          ? await prisma.customer.findFirst({ where: { id, tenantId }, select: { firstName: true, lastName: true } })
          : await prisma.doctor.findFirst({ where: { id, tenantId }, select: { firstName: true, lastName: true } });
      return found ? { id, name: fullName(found) } : null;
    }
    const raw = (kind === "customer" ? d.newCustomer : d.newDoctor) as Record<string, unknown> | undefined;
    const firstName = text(raw?.firstName);
    const lastName = text(raw?.lastName);
    if (!firstName || !lastName) return null;
    const extra = text(kind === "customer" ? raw?.phone : raw?.licenseNumber, 40) || undefined;
    return { fresh: kind === "customer" ? { firstName, lastName, phone: extra } : { firstName, lastName, licenseNumber: extra }, name: `${firstName} ${lastName}` };
  };
  const customer = await person("customer");
  if (!customer) return { error: "A customer is required for the prescription." };
  const doctor = await person("doctor");
  if (!doctor) return { error: "A prescribing doctor is required for the prescription." };

  // Same rule as checkout: the amount is read off the prescription for each
  // Rx-flagged item (or every item when none are flagged), never below what's bought.
  const rawQty = (d.prescribedQuantities ?? {}) as Record<string, unknown>;
  const flagged = items.filter((i) => requiresRx.get(i.productId));
  const rxLines = flagged.length > 0 ? flagged : items;
  const prescribedQuantities: Record<string, number> = {};
  for (const line of rxLines) {
    const qty = Math.trunc(Number(rawQty[line.productId]));
    if (!Number.isFinite(qty) || qty <= 0) return { error: "Enter the prescribed quantity of every item on the prescription." };
    if (qty < line.quantity) return { error: "An item's quantity is more than what was prescribed." };
    prescribedQuantities[line.productId] = qty;
  }

  return {
    value: {
      prescriptionDraft: {
        ...("id" in customer ? { customerId: customer.id } : { newCustomer: customer.fresh as OrderPrescriptionDraft["newCustomer"] }),
        ...("id" in doctor ? { doctorId: doctor.id } : { newDoctor: doctor.fresh as OrderPrescriptionDraft["newDoctor"] }),
        writtenDate,
        instructions: text(d.instructions, 500) || undefined,
        prescribedQuantities,
      },
      label: `${customer.name} · Dr. ${doctor.name}`,
    },
  };
}
