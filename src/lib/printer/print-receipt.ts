"use client";

import { generateThermalReceiptText, printReceipt } from "@/lib/receipt";
import type { ReceiptData } from "@/types/receipt";
import { reconnectUsbPrinter } from "./usb";
import { reconnectBluetoothPrinter } from "./bluetooth";
import { textToEscPosBytes } from "./encode";
import type { PrinterConnection } from "./types";

// The thermal printer paired in the POS (USB or Bluetooth), reconnected once
// per page and shared by every reprint on it. Null when none is paired.
let paired: Promise<PrinterConnection | null> | null = null;
const getPairedPrinter = () =>
  (paired ??= (async () => (await reconnectUsbPrinter().catch(() => null)) ?? (await reconnectBluetoothPrinter().catch(() => null)))());

// Prints a receipt the way the POS does: on the paired thermal printer when
// there is one, otherwise through the browser's print dialog.
export async function printReceiptAnywhere(data: ReceiptData) {
  const printer = await getPairedPrinter();
  if (printer) {
    try {
      await printer.send(textToEscPosBytes(generateThermalReceiptText(data)));
      return;
    } catch {
      // Unplugged or out of range: look again next time, use the browser now.
      paired = null;
    }
  }
  printReceipt(data);
}
