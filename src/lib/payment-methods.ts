// How customers pay at the counter. Card values remain in the database enum for
// older sales but are no longer offered at checkout.
export const E_WALLET_PROVIDERS = ["GCash", "Maya", "ShopeePay", "GrabPay", "Other"] as const;

// Reference numbers are printed on the receipt and searched later, so keep
// them to plain characters.
export const normalizeReference = (value: unknown) =>
  typeof value === "string" ? value.replace(/[^A-Za-z0-9 -]/g, "").trim().slice(0, 40) : "";

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: "Cash",
  E_WALLET: "E-wallet",
  CREDIT_CARD: "Credit card",
  DEBIT_CARD: "Debit card",
  INSURANCE: "Insurance",
  CHECK: "Check",
  SPLIT: "Split",
  POINTS: "Loyalty points",
};

export const paymentMethodLabel = (method: string) => PAYMENT_METHOD_LABELS[method] ?? method;

// Not a stored payment method: the part of a sale paid with loyalty points,
// shown as its own row wherever amounts are broken down by payment method.
export const POINTS_METHOD = "POINTS";

const n = (v: unknown) => Number(v ?? 0);
const cents = (v: number) => Math.round(v * 100) / 100;

// The money actually received for a sale (or refunded, for a negative return
// row): its total minus the part paid with loyalty points.
export const moneyReceived = (s: { totalAmount: unknown; pointsAmount?: unknown }) =>
  n(s.pointsAmount) === 0 ? n(s.totalAmount) : cents(n(s.totalAmount) - n(s.pointsAmount));

// A sale split by how it was paid: money under its own method, plus a POINTS
// part when loyalty points were used. The parts add up to totalAmount.
export const paymentParts = (s: { paymentMethod: string; totalAmount: unknown; pointsAmount?: unknown }) => {
  const points = n(s.pointsAmount);
  if (points === 0) return [{ method: s.paymentMethod, amount: n(s.totalAmount) }];
  return [
    { method: s.paymentMethod, amount: moneyReceived(s) },
    { method: POINTS_METHOD, amount: points },
  ];
};
