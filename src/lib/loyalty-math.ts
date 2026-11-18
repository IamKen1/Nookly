// Pure loyalty-points arithmetic, shared by the server and the POS so both
// show the same numbers. Money is worked in whole centavos to avoid float
// drift (e.g. 0.3 / 0.1 = 2.9999…), and points are always whole numbers.

export const DEFAULT_PESOS_PER_POINT = 50;
export const DEFAULT_PESO_VALUE_PER_POINT = 1;

const toCents = (pesos: number) => Math.round(pesos * 100);

// Points earned on the money actually paid. Rounded down: ₱449 at ₱50/point = 8.
export function pointsEarnedFor(amountPaid: number, pesosPerPoint: number): number {
  const paid = toCents(amountPaid);
  const rate = toCents(pesosPerPoint);
  if (paid <= 0 || rate <= 0) return 0;
  return Math.floor(paid / rate);
}

// Peso value of a number of points, to the centavo.
export function pointsToPesos(points: number, pesoValuePerPoint: number): number {
  if (points <= 0) return 0;
  return (points * toCents(pesoValuePerPoint)) / 100;
}

// The most points that can be used on a sale: no more than the customer has,
// and no more than it takes to pay the whole total (no change is given in points).
export function maxRedeemablePoints(balance: number, totalAmount: number, pesoValuePerPoint: number): number {
  const value = toCents(pesoValuePerPoint);
  const total = toCents(totalAmount);
  if (balance <= 0 || value <= 0 || total <= 0) return 0;
  return Math.min(Math.floor(balance), Math.floor(total / value));
}

// Points moved by a partial return of `ratio` (0–1) of a sale. Earned points
// are taken back rounded up and used points are given back rounded down, so
// a buy-then-return never leaves the customer ahead. The small epsilon keeps
// float noise in `ratio` (0.30000000000000004) from tipping a whole point.
export function pointsForReturn(
  pointsEarned: number,
  pointsRedeemed: number,
  ratio: number
): { earnBack: number; redeemBack: number } {
  const r = Math.min(Math.max(ratio, 0), 1);
  const EPS = 1e-9;
  return {
    earnBack: Math.min(pointsEarned, Math.max(0, Math.ceil(pointsEarned * r - EPS))),
    redeemBack: Math.min(pointsRedeemed, Math.max(0, Math.floor(pointsRedeemed * r + EPS))),
  };
}

// Points to move for one return when a sale may be returned in several parts.
// Works on the cumulative share returned so far, so rounding never adds up to
// more than the sale earned or used: e.g. 1 point earned, returned in thirds,
// takes back 1 point in total, not 1 per return.
export function pointsForNextReturn(
  pointsEarned: number,
  pointsRedeemed: number,
  cumulativeRatio: number,
  alreadyEarnBack: number,
  alreadyRedeemBack: number
): { earnBack: number; redeemBack: number } {
  const total = pointsForReturn(pointsEarned, pointsRedeemed, cumulativeRatio);
  return {
    earnBack: Math.max(0, total.earnBack - alreadyEarnBack),
    redeemBack: Math.max(0, total.redeemBack - alreadyRedeemBack),
  };
}

// Peso value per point actually used on a past sale (its saved snapshot), so a
// return refunds points at the rate they were spent, not today's rate.
export function savedValuePerPoint(pointsRedeemed: number, pointsAmount: number): number {
  return pointsRedeemed > 0 ? toCents(pointsAmount) / pointsRedeemed / 100 : 0;
}

// Owner-entered rates must be positive and sensible.
export function validateRate(value: unknown, label: string): { ok: true; value: number } | { ok: false; error: string } {
  const n = typeof value === "string" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) {
    return { ok: false, error: `${label} must be more than zero.` };
  }
  if (n > 100000) return { ok: false, error: `${label} is too large.` };
  if (Math.abs(toCents(n) - n * 100) > 1e-6) return { ok: false, error: `${label} can have at most 2 decimal places.` };
  return { ok: true, value: toCents(n) / 100 };
}
