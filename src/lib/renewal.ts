import { phDayOf } from "@/lib/permissions-shared";

// Nookly doesn't charge automatically: a paid period ends unless the owner asks
// to renew and pays. The notice starts this many days ahead.
export const RENEWAL_NOTICE_DAYS = 7;

// Calendar days (Philippine time) from today to the day the period ends: 0 is today.
export function phDaysUntil(end: Date, now = new Date()): number {
  return Math.round((Date.parse(phDayOf(end)) - Date.parse(phDayOf(now))) / 86_400_000);
}

export function renewalDueLabel(daysLeft: number): string {
  return daysLeft <= 0 ? "today" : daysLeft === 1 ? "tomorrow" : `in ${daysLeft} days`;
}
