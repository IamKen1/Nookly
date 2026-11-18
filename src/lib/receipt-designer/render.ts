// Browser-only: turns a receipt and the owner's design into printer bytes or
// a print page. Callers fall back to the standard receipt if anything here throws.
import JsBarcode from "jsbarcode";
import type { ReceiptData } from "@/types/receipt";
import type { Template } from "./types";
import { layoutReceipt } from "./layout";
import { toPrintedLines } from "./textmode";
import { encodeImageMode, encodeTextMode } from "./escpos";
import { canvasToRaster, drawReceiptCanvas, prepareTextModeRasters } from "./canvas";
import { imageModeHtml, printDocument, textModeHtml } from "./html";

export const barcodeSvg = (content: string, height: number, showText: boolean) => {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  JsBarcode(svg, content, { format: "CODE128", height, width: 2, margin: 0, displayValue: showText, fontSize: 18 });
  svg.setAttribute("style", "max-width:100%;height:auto;display:block");
  return svg.outerHTML;
};

// Bytes for the paired thermal printer.
export async function designerThermalBytes(data: ReceiptData, t: Template): Promise<Uint8Array> {
  const rows = layoutReceipt(t, data);
  if (t.printMode === "IMAGE") {
    const canvas = await drawReceiptCanvas(rows, t);
    return encodeImageMode(canvasToRaster(canvas), 0); // the picture already ends with blank paper
  }
  const lines = toPrintedLines(rows, t.paperWidth);
  return encodeTextMode(lines, await prepareTextModeRasters(lines, t.paperWidth));
}

// The receipt as HTML: the preview, or (wrapped by printDocument) the browser print.
export async function designerHtml(data: ReceiptData, t: Template): Promise<string> {
  const rows = layoutReceipt(t, data);
  if (t.printMode === "IMAGE") return imageModeHtml((await drawReceiptCanvas(rows, t)).toDataURL("image/png"));
  return textModeHtml(toPrintedLines(rows, t.paperWidth), t.paperWidth, { barcodeSvg });
}

export async function designerPrintPage(data: ReceiptData, t: Template): Promise<string> {
  return printDocument(await designerHtml(data, t), t.paperWidth, data.saleNumber, false);
}

// Same hidden-iframe printing as the standard receipt (see printReceipt in
// src/lib/receipt.ts): reliable after async work, unlike a popup.
export function printHtml(html: string) {
  const iframe = document.createElement("iframe");
  Object.assign(iframe.style, { position: "fixed", right: "0", bottom: "0", width: "0", height: "0", border: "0" });
  document.body.appendChild(iframe);
  const cleanup = () => setTimeout(() => iframe.remove(), 1000);
  iframe.onload = () => {
    const win = iframe.contentWindow;
    if (!win) return cleanup();
    win.addEventListener("afterprint", cleanup);
    // Let images and fonts in the page finish before printing.
    setTimeout(() => {
      win.focus();
      win.print();
    }, 250);
    setTimeout(cleanup, 15000);
  };
  iframe.srcdoc = html;
}

// Splits the receipt endpoint's response into the receipt and the design (if any).
export function parseReceiptResponse(json: Record<string, unknown>): { data: ReceiptData; designer: Template | null } {
  const { designer, ...rest } = json as Record<string, unknown> & { designer?: Template };
  return { data: { ...(rest as unknown as ReceiptData), date: new Date(rest.date as string) }, designer: designer ?? null };
}
