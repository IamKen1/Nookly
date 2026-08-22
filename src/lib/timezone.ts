// Nookly only serves Philippine pharmacies, so "today" for sales/reporting
// must always mean the Philippine calendar day — never the server process's
// own local time (Vercel runs in UTC), and never the viewer's browser
// timezone (an owner checking in from abroad shouldn't see a different
// "today" than the cashier on the floor). Asia/Manila is UTC+8 year-round
// with no DST, so a fixed offset is exact, not an approximation.
const PH_OFFSET_MS = 8 * 60 * 60 * 1000;

// Returns the UTC instant corresponding to 00:00 Philippine time for "now"
// (or for a given instant), suitable as a `gte` bound on a saleDate/DateTime
// column — comparisons on stored UTC instants stay correct regardless of
// what timezone the process happens to be running in.
export function startOfTodayPH(now: Date = new Date()): Date {
  const phShifted = new Date(now.getTime() + PH_OFFSET_MS);
  return new Date(Date.UTC(phShifted.getUTCFullYear(), phShifted.getUTCMonth(), phShifted.getUTCDate()) - PH_OFFSET_MS);
}
