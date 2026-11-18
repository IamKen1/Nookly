"use client";

import { generateThermalReceiptText, printReceipt } from "@/lib/receipt";
import type { ReceiptData } from "@/types/receipt";
import type { Template } from "@/lib/receipt-designer/types";
import { textToEscPosBytes } from "./encode";
import { ensurePrinter, setPrinter } from "./store";

// Prints with the owner's receipt design (Settings › Receipt designer): on the
// connected receipt printer when there is one, otherwise through the browser's
// print dialog. Throws if the design can't be rendered, so callers can print
// the standard receipt instead.
export async function printDesignedReceipt(data: ReceiptData, design: Template) {
  // Loaded only when a design is in use, so everyone else's pages stay as light as before.
  const { designerThermalBytes, designerPrintPage, printHtml } = await import("@/lib/receipt-designer/render");
  const printer = await ensurePrinter();
  if (printer) {
    const bytes = await designerThermalBytes(data, design);
    try {
      await printer.send(bytes);
      return;
    } catch {
      setPrinter(null);
    }
  }
  printHtml(await designerPrintPage(data, design));
}

// Prints a receipt the way the POS does: on the connected receipt printer
// (shared across pages) when there is one, otherwise through the browser's
// print dialog. With a `design`, the owner's own layout is used, falling back
// to the standard receipt if it can't be rendered.
export async function printReceiptAnywhere(data: ReceiptData, design: Template | null = null) {
  if (design) {
    try {
      await printDesignedReceipt(data, design);
      return;
    } catch (error) {
      console.error("Receipt design couldn't be printed; printing the standard receipt.", error);
    }
  }
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
