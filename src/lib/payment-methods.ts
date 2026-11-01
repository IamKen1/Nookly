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
};

export const paymentMethodLabel = (method: string) => PAYMENT_METHOD_LABELS[method] ?? method;
