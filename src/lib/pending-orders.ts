export interface PendingOrderItem {
  productId: string;
  quantity: number;
}

// PendingOrder.items is JSON, so anything read from it (or from a request body)
// is validated here — malformed lines are dropped rather than trusted.
export function parsePendingItems(value: unknown): PendingOrderItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw) => {
    if (!raw || typeof raw !== "object") return [];
    const { productId, quantity } = raw as Record<string, unknown>;
    const qty = Math.trunc(Number(quantity));
    if (typeof productId !== "string" || !productId || !Number.isFinite(qty) || qty <= 0) return [];
    return [{ productId, quantity: qty }];
  });
}
