"use client";

import { reconnectUsbPrinter } from "./usb";
import { reconnectBluetoothPrinter } from "./bluetooth";
import type { PrinterConnection } from "./types";

// One receipt-printer connection for the whole app, so it survives moving
// between pages (POS → Dashboard → Sales) instead of living and dying with
// the POS screen. Every page reads and prints through it.
let current: PrinterConnection | null = null;
let reconnecting: Promise<PrinterConnection | null> | null = null;
const listeners = new Set<() => void>();

export const getPrinter = () => current;

export function setPrinter(connection: PrinterConnection | null) {
  current = connection;
  listeners.forEach((l) => l());
}

export function subscribePrinter(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// The connected printer, reconnecting to the last paired one if this page
// hasn't connected yet (after a full reload). Null when there's none.
export async function ensurePrinter(): Promise<PrinterConnection | null> {
  if (current) return current;
  reconnecting ??= (async () => (await reconnectUsbPrinter().catch(() => null)) ?? (await reconnectBluetoothPrinter().catch(() => null)))().finally(() => {
    reconnecting = null;
  });
  const found = await reconnecting;
  if (found && !current) setPrinter(found);
  return current;
}
