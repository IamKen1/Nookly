import type { PrintedLine } from "./textmode";
import { columnsFor } from "./textmode";
import type { PaperWidth } from "./types";
import { qrMatrix } from "./raster";
import { escPosSafeText } from "@/lib/printer/encode";

// HTML for a text-mode receipt: the printer's monospace grid, line for line,
// so the preview and the browser print match the thermal printout.

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Font B characters are 9×17 dots against Font A's 12×24.
const FONT_W = { A: 1, B: 0.75 };
const FONT_H = { A: 1, B: 17 / 24 };

export function qrSvg(content: string): string {
  const m = qrMatrix(content);
  const n = m.size + 8;
  let path = "";
  for (let y = 0; y < m.size; y++) for (let x = 0; x < m.size; x++) if (m.dark(x, y)) path += `M${x + 4} ${y + 4}h1v1h-1z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges" style="width:100%;height:auto;display:block"><rect width="${n}" height="${n}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
}

export interface HtmlOptions {
  // Barcode as an SVG string (made with jsbarcode in the browser); omitted → a placeholder box.
  barcodeSvg?: (content: string, height: number, showText: boolean) => string;
  // Marks each line with the block it came from, for clicking in the designer.
  lineAttrs?: (index: number) => string;
}

export function textModeHtml(lines: PrintedLine[], paperWidth: PaperWidth, opts: HtmlOptions = {}): string {
  const cols = columnsFor(paperWidth, "A", 1);
  const body = lines
    .map((l, i) => {
      const attrs = `${l.blockId ? `data-block="${esc(l.blockId)}"` : ""} ${opts.lineAttrs?.(i) ?? ""}`.trim();
      if (l.kind === "image") {
        const just = l.align === "center" ? "center" : l.align === "right" ? "flex-end" : "flex-start";
        return `<div class="r-pic" style="justify-content:${just}" ${attrs}><img src="${esc(l.src)}" style="width:${l.widthPct}%" alt=""></div>`;
      }
      if (l.kind === "qr") {
        const just = l.align === "center" ? "center" : l.align === "right" ? "flex-end" : "flex-start";
        return `<div class="r-pic" style="justify-content:${just}" ${attrs}><div style="width:${l.sizePct}%">${qrSvg(l.content)}</div></div>`;
      }
      if (l.kind === "barcode") {
        const just = l.align === "center" ? "center" : l.align === "right" ? "flex-end" : "flex-start";
        const svg = opts.barcodeSvg?.(l.content, l.height, l.showText) ?? `<div class="r-barcode">${esc(l.content)}</div>`;
        return `<div class="r-pic" style="justify-content:${just}" ${attrs}><div style="max-width:100%">${svg}</div></div>`;
      }
      const lineCols = columnsFor(paperWidth, l.font, l.sizeW);
      const len = Array.from(l.text).length;
      const pad = l.align === "center" ? Math.floor((lineCols - len) / 2) : l.align === "right" ? lineCols - len : 0;
      const w = l.sizeW * FONT_W[l.font];
      const h = l.sizeH * FONT_H[l.font];
      const style = [
        `font-size:${h}em`,
        `transform:scaleX(${(w / h).toFixed(4)})`,
        l.bold ? "font-weight:700" : "",
      ]
        .filter(Boolean)
        .join(";");
      const textStyle = [l.inverse ? "background:#000;color:#fff" : "", l.underline ? "text-decoration:underline" : ""].filter(Boolean).join(";");
      // escPosSafeText: show exactly what the printer prints (₱ comes out as P on thermal code pages).
      return `<div class="r-line" style="${style}" ${attrs}>${" ".repeat(Math.max(0, pad))}<span${textStyle ? ` style="${textStyle}"` : ""}>${esc(escPosSafeText(l.text)) || "&nbsp;"}</span></div>`;
    })
    .join("");
  return `<div class="r-paper r-text" style="--cols:${cols}">${body}</div>`;
}

// Shared CSS for the receipt preview and the print page.
export const RECEIPT_CSS = `
.r-paper{background:#fff;color:#000;box-sizing:border-box;padding:6px 4px}
.r-text{font-family:"Courier New",Courier,monospace;font-size:13px;line-height:1.2;width:calc(var(--cols) * 0.6em + 8px)}
.r-line{white-space:pre;transform-origin:left top;overflow:visible}
.r-pic{display:flex;margin:2px 0}
.r-pic img{display:block;height:auto}
.r-barcode{border:1px dashed #999;padding:8px;font:11px monospace}
.r-image img{display:block;width:100%;height:auto;image-rendering:pixelated}
`;

// A complete page for the browser's print dialog, sized to the roll.
export function printDocument(fragment: string, paperWidth: PaperWidth, title: string, autoPrint: boolean): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>${RECEIPT_CSS}
@page{size:${paperWidth}mm auto;margin:0}
html,body{margin:0;background:#fff}
body{width:${paperWidth}mm}
.r-text{width:100%;font-size:calc((${paperWidth}mm - 8px) / ${(0.6 * (paperWidth === 58 ? 32 : 48)).toFixed(1)})}
</style></head><body>${fragment}${autoPrint ? "<script>window.onload=function(){window.print()}</script>" : ""}</body></html>`;
}

// Image mode: the receipt is the picture itself.
export const imageModeHtml = (dataUrl: string) => `<div class="r-paper r-image"><img src="${dataUrl}" alt="Receipt"></div>`;
