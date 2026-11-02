"use client";

import { generateThermalReceiptText, printReceipt } from "@/lib/receipt";
import type { ReceiptData } from "@/types/receipt";
import { textToEscPosBytes } from "./encode";
import { ensurePrinter, setPrinter } from "./store";

// Prints a receipt the way the POS does: on the connected receipt printer
// (shared across pages) when there is one, otherwise through the browser's
// print dialog.
export async function printReceiptAnywhere(data: ReceiptData) {
  const printer = await ensurePrinter();
  if (printer) {
    try {
      await printer.send(textToEscPosBytes(generateThermalReceiptText(data)));
      return;
    } catch {
      // Unplugged or out of range: forget it so the header shows it's gone.
      setPrinter(null);
    }
  }
  printReceipt(data);
}
