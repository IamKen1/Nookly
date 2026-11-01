// Checks the supplier form (Suppliers page). Only fields present in the body
// are returned, so a partial update leaves the rest alone.
export function parseSupplierBody(body: Record<string, unknown>) {
  const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, max) || null : null);
  const data: {
    name?: string;
    contactPerson?: string | null;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
    tin?: string | null;
    paymentTermsDays?: number;
    notes?: string | null;
    isActive?: boolean;
  } = {};

  if ("name" in body) {
    const name = text(body.name, 80);
    if (!name) return { error: "Supplier name is required." };
    data.name = name;
  }
  if ("contactPerson" in body) data.contactPerson = text(body.contactPerson, 80);
  if ("phone" in body) data.phone = text(body.phone, 40);
  if ("email" in body) {
    const email = text(body.email, 120);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "That email address doesn't look right." };
    data.email = email;
  }
  if ("address" in body) data.address = text(body.address, 200);
  if ("tin" in body) data.tin = text(body.tin, 30);
  if ("notes" in body) data.notes = typeof body.notes === "string" ? body.notes.trim().slice(0, 500) || null : null;
  if ("paymentTermsDays" in body) {
    const days = Number(body.paymentTermsDays);
    if (!Number.isInteger(days) || days < 0 || days > 365) return { error: "Payment terms must be 0 to 365 days." };
    data.paymentTermsDays = days;
  }
  if ("isActive" in body) data.isActive = Boolean(body.isActive);
  return { data };
}
