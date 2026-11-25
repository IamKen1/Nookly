import { peso } from "@/lib/receipt";
import type { DateFormat, NameFormat, TimeFormat, ValueFormat, VatCodes } from "./types";

// Today's item markers: V for VATable (also on SC/PWD sales), N for non-VAT.
export const DEFAULT_VAT_CODES: VatCodes = { vatable: "V", exempt: "V", nonVat: "N" };

// How values are written on a designed receipt (Design › Whole receipt).
// "default" everywhere = exactly today's receipt.
export const DEFAULT_FORMAT: ValueFormat = { currency: "peso", date: "default", time: "default", cashierName: "full", customerName: "full" };

export const DATE_FORMATS: { value: DateFormat; label: string }[] = [
  { value: "default", label: "11/22/2026 (default)" },
  { value: "MM-DD-YY", label: "11-22-26" },
  { value: "MM/DD/YY", label: "11/22/26" },
  { value: "MM/DD/YYYY", label: "11/22/2026 (always 2 digits)" },
  { value: "YYYY-MM-DD", label: "2026-11-22" },
  { value: "MMM D, YYYY", label: "Nov 22, 2026" },
];
export const TIME_FORMATS: { value: TimeFormat; label: string }[] = [
  { value: "default", label: "10:57 AM (default)" },
  { value: "h:mmA", label: "10:57A" },
  { value: "hh:mm AM", label: "09:05 AM" },
  { value: "HH:mm", label: "21:05" },
  { value: "HH:mm:ss", label: "21:05:30" },
];
export const NAME_FORMATS: { value: NameFormat; label: string }[] = [
  { value: "full", label: "Juan dela Cruz" },
  { value: "first", label: "Juan" },
  { value: "last", label: "dela Cruz" },
  { value: "firstLastInitial", label: "Juan D." },
  { value: "lastFirst", label: "dela Cruz, Juan" },
];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// The sale's date and time in the Philippines, whatever the device's time zone.
function phParts(d: Date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Manila",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
      hourCycle: "h23",
    })
      .formatToParts(d)
      .map((p) => [p.type, p.value])
  );
  return { y: Number(parts.year), m: Number(parts.month), d: Number(parts.day), h: Number(parts.hour), min: Number(parts.minute), s: Number(parts.second) };
}
const two = (n: number) => String(n).padStart(2, "0");

export function formatDate(d: Date, f: DateFormat): string {
  if (f === "default") return d.toLocaleDateString("en-PH");
  const p = phParts(d);
  switch (f) {
    case "MM-DD-YY": return `${two(p.m)}-${two(p.d)}-${two(p.y % 100)}`;
    case "MM/DD/YY": return `${two(p.m)}/${two(p.d)}/${two(p.y % 100)}`;
    case "MM/DD/YYYY": return `${two(p.m)}/${two(p.d)}/${p.y}`;
    case "YYYY-MM-DD": return `${p.y}-${two(p.m)}-${two(p.d)}`;
    case "MMM D, YYYY": return `${MONTHS[p.m - 1]} ${p.d}, ${p.y}`;
  }
}

export function formatTime(d: Date, f: TimeFormat): string {
  if (f === "default") return d.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit", hour12: true });
  const p = phParts(d);
  const h12 = p.h % 12 === 0 ? 12 : p.h % 12;
  const ap = p.h < 12 ? "A" : "P";
  switch (f) {
    case "h:mmA": return `${h12}:${two(p.min)}${ap}`;
    case "hh:mm AM": return `${two(h12)}:${two(p.min)} ${ap}M`;
    case "HH:mm": return `${two(p.h)}:${two(p.min)}`;
    case "HH:mm:ss": return `${two(p.h)}:${two(p.min)}:${two(p.s)}`;
  }
}

export function formatName(p: { firstName: string; lastName: string } | null | undefined, f: NameFormat): string | null {
  if (!p) return null;
  const first = p.firstName.trim();
  const last = p.lastName.trim();
  const out =
    f === "first" ? first || last
    : f === "last" ? last || first
    : f === "firstLastInitial" ? `${first}${last ? ` ${last[0]}.` : ""}`
    : f === "lastFirst" ? [last, first].filter(Boolean).join(", ")
    : `${first} ${last}`;
  return out.trim() || null;
}

// Money as the design writes it: ₱312.50 or 312.50.
export const moneyFormatter = (f: ValueFormat) => (n: number) => (f.currency === "none" ? peso(n).replace("₱", "") : peso(n));
