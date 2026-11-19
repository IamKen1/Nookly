// Browser-only: draws receipts on a canvas (image mode and its preview) and
// turns pictures into printer rasters. Pure layout lives in layout.ts.
import JsBarcode from "jsbarcode";
import type { Row } from "./layout";
import type { PrintedLine } from "./textmode";
import { columnWidths } from "./textmode";
import type { Align, PaperWidth, ResolvedStyle, Template } from "./types";
import { IMAGE_FONTS } from "./types";
import type { RasterFor } from "./escpos";
import type { Raster } from "./raster";
import { PAPER_DOTS, ditherToRaster, placeOnPaper, qrMatrix, qrRaster, rgbaToGray } from "./raster";

// 203 dpi print head: one point is 203/72 dots.
const PT = 203 / 72;
const PAD = 6;

const fontPx = (s: ResolvedStyle) => Math.max(8, Math.round(s.fontSize * PT));
const lineHeightPx = (s: ResolvedStyle) => Math.round(fontPx(s) * s.lineHeight);
const cssFont = (s: ResolvedStyle) =>
  `${s.italic ? "italic " : ""}${s.bold ? "700" : "400"} ${fontPx(s)}px ${(IMAGE_FONTS[s.fontFamily] ?? IMAGE_FONTS.courier).css}`;

// ---------- fonts and images ----------

const loadedFonts = new Set<string>();

// Loads the Google Fonts a design uses before drawing; falls back to system
// fonts if they can't load in time.
export async function loadFonts(families: string[], timeoutMs = 4000): Promise<void> {
  const wanted = [...new Set(families)].filter((f) => IMAGE_FONTS[f]?.google && !loadedFonts.has(f));
  if (wanted.length === 0) return;
  const href = `https://fonts.googleapis.com/css2?${wanted.map((f) => `family=${IMAGE_FONTS[f].google}`).join("&")}&display=block`;
  if (!document.querySelector(`link[data-receipt-fonts="${href}"]`)) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.dataset.receiptFonts = href;
    document.head.appendChild(link);
  }
  const loads = wanted.flatMap((f) => {
    const family = IMAGE_FONTS[f].css.split(",")[0];
    return ["400", "700", "italic 400", "italic 700"].map((v) => document.fonts.load(`${v} 24px ${family}`).catch(() => []));
  });
  await Promise.race([Promise.all(loads), new Promise((r) => setTimeout(r, timeoutMs))]);
  wanted.forEach((f) => loadedFonts.add(f));
}

export function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous"; // needed to read the pixels back for printing
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

export interface Assets {
  images: Map<string, HTMLImageElement>;
}

export async function loadAssets(rows: Row[]): Promise<Assets> {
  const images = new Map<string, HTMLImageElement>();
  const srcs = [...new Set(rows.filter((r): r is Extract<Row, { kind: "image" }> => r.kind === "image").map((r) => r.src))];
  await Promise.all(
    srcs.map(async (src) => {
      const img = await loadImage(src);
      if (img) images.set(src, img); // a logo that won't load is skipped
    })
  );
  return { images };
}

const barcodeCanvas = (content: string, height: number, showText: boolean) => {
  const c = document.createElement("canvas");
  JsBarcode(c, content, { format: "CODE128", height, width: 2, margin: 0, displayValue: showText, fontSize: 18, background: "#ffffff" });
  return c;
};

// ---------- image mode: the whole receipt on a canvas ----------

const alignX = (align: Align, width: number, paper: number) =>
  align === "center" ? (paper - width) / 2 : align === "right" ? paper - PAD - width : PAD;

function wrapWords(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const out: string[] = [];
  for (const para of text.split(/\r?\n/)) {
    if (para === "") {
      out.push("");
      continue;
    }
    let line = "";
    for (const word of para.split(/(\s+)/)) {
      const candidate = line + word;
      if (ctx.measureText(candidate).width <= maxWidth || line === "") {
        // A single word wider than the paper is broken by characters.
        if (ctx.measureText(candidate).width > maxWidth && line === "") {
          let part = "";
          for (const ch of Array.from(word)) {
            if (ctx.measureText(part + ch).width > maxWidth && part) {
              out.push(part);
              part = ch;
            } else part += ch;
          }
          line = part;
        } else line = candidate;
      } else {
        out.push(line.trimEnd());
        line = word.trimStart();
      }
    }
    out.push(line.trimEnd());
  }
  return out;
}

// Draws (or, with ctx.canvas sized 0, just measures) the receipt. Returns its height.
function paint(ctx: CanvasRenderingContext2D, rows: Row[], paper: number, assets: Assets, draw: boolean, padY = PAD): number {
  let y = padY;
  // Rows of one table share column widths (the widest content of each column), as in text mode.
  const groupNeed = new Map<string, number[]>();
  for (const r of rows) {
    if (r.kind !== "columns" || !r.group) continue;
    ctx.font = cssFont(r.style);
    const cur = groupNeed.get(r.group) ?? [];
    r.cells.forEach((c, i) => (cur[i] = Math.max(cur[i] ?? 1, Math.ceil(Math.max(1, ...c.text.split(/\r?\n/).map((p) => ctx.measureText(p).width))))));
    groupNeed.set(r.group, cur);
  }
  const inner = paper - PAD * 2;

  const textLine = (text: string, s: ResolvedStyle, align: Align) => {
    ctx.font = cssFont(s);
    if ("letterSpacing" in ctx) (ctx as unknown as { letterSpacing: string }).letterSpacing = `${s.letterSpacing}px`;
    const h = lineHeightPx(s);
    const w = ctx.measureText(text).width;
    if (draw) {
      if (s.inverse || s.background) {
        ctx.fillStyle = s.inverse ? "#000000" : (s.background as string);
        ctx.fillRect(0, y, paper, h);
      }
      ctx.fillStyle = s.inverse ? "#ffffff" : s.color;
      ctx.textBaseline = "middle";
      const x = alignX(align, w, paper);
      ctx.fillText(text, x, y + h / 2);
      if (s.underline) ctx.fillRect(x, y + h / 2 + fontPx(s) * 0.45, w, Math.max(1, Math.round(fontPx(s) / 14)));
    }
    y += h;
  };

  for (const row of rows) {
    switch (row.kind) {
      case "feed":
        y += row.lines * lineHeightPx(row.style);
        break;
      case "text": {
        ctx.font = cssFont(row.style);
        for (const l of wrapWords(ctx, row.text, inner)) textLine(l, row.style, row.align);
        break;
      }
      case "pair": {
        const s = row.style;
        ctx.font = cssFont(s);
        const lw = ctx.measureText(row.left).width;
        const rw = ctx.measureText(row.right).width;
        const h = lineHeightPx(s);
        if (lw + rw + fontPx(s) * 0.6 <= inner) {
          if (draw) {
            if (s.inverse || s.background) {
              ctx.fillStyle = s.inverse ? "#000000" : (s.background as string);
              ctx.fillRect(0, y, paper, h);
            }
            ctx.fillStyle = s.inverse ? "#ffffff" : s.color;
            ctx.textBaseline = "middle";
            ctx.fillText(row.left, PAD, y + h / 2);
            ctx.fillText(row.right, paper - PAD - rw, y + h / 2);
          }
          y += h;
        } else {
          for (const l of wrapWords(ctx, row.left, inner)) textLine(l, s, "left");
          textLine(row.right, s, "right");
        }
        break;
      }
      case "columns": {
        // Same split as text mode, in dots: fixed columns take their %, the rest share.
        const s = row.style;
        ctx.font = cssFont(s);
        const gapPx = row.gap * ctx.measureText(" ").width;
        const shared = row.group ? groupNeed.get(row.group) : undefined;
        const widths = columnWidths(
          row.cells.map((c, i) => ({ width: c.width, need: shared?.[i] ?? Math.ceil(Math.max(1, ...c.text.split(/\r?\n/).map((p) => ctx.measureText(p).width))) })),
          Math.floor(inner),
          Math.round(gapPx)
        );
        const wrapped = row.cells.map((c, i) => wrapWords(ctx, c.text, Math.max(8, widths[i])));
        const h = lineHeightPx(s);
        const height = Math.max(...wrapped.map((w) => w.length));
        if (draw) {
          if (s.inverse || s.background) {
            ctx.fillStyle = s.inverse ? "#000000" : (s.background as string);
            ctx.fillRect(0, y, paper, h * height);
          }
          ctx.fillStyle = s.inverse ? "#ffffff" : s.color;
          ctx.textBaseline = "middle";
          let x = PAD;
          row.cells.forEach((c, i) => {
            wrapped[i].forEach((t, r) => {
              const w = ctx.measureText(t).width;
              const tx = c.align === "right" ? x + widths[i] - w : c.align === "center" ? x + (widths[i] - w) / 2 : x;
              ctx.fillText(t, tx, y + r * h + h / 2);
              if (s.underline) ctx.fillRect(tx, y + r * h + h / 2 + fontPx(s) * 0.45, w, Math.max(1, Math.round(fontPx(s) / 14)));
            });
            x += widths[i] + Math.round(gapPx);
          });
        }
        y += h * height;
        break;
      }
      case "rule": {
        const h = Math.round(lineHeightPx(row.style) * 0.7);
        if (draw && row.char !== " ") {
          ctx.fillStyle = row.style.color;
          const mid = y + h / 2;
          if (row.char === "=") {
            ctx.fillRect(PAD, mid - 3, inner, 2);
            ctx.fillRect(PAD, mid + 1, inner, 2);
          } else if (row.char === "-") {
            for (let x = PAD; x < paper - PAD; x += 10) ctx.fillRect(x, mid - 1, 6, 2);
          } else if (row.char === ".") {
            for (let x = PAD; x < paper - PAD; x += 6) ctx.fillRect(x, mid - 1, 2, 2);
          } else {
            ctx.font = cssFont(row.style);
            ctx.textBaseline = "middle";
            const star = ctx.measureText("*").width || 8;
            for (let x = PAD; x + star <= paper - PAD; x += star) ctx.fillText("*", x, mid);
          }
        }
        y += h;
        break;
      }
      case "image": {
        const img = assets.images.get(row.src);
        if (!img) break;
        const w = Math.round((inner * row.widthPct) / 100);
        const h = Math.round((img.naturalHeight / img.naturalWidth) * w);
        if (draw) ctx.drawImage(img, alignX(row.align, w, paper), y, w, h);
        y += h + 4;
        break;
      }
      case "qr": {
        const m = qrMatrix(row.content);
        const scale = Math.max(1, Math.floor((inner * row.sizePct) / 100 / (m.size + 8)));
        const side = (m.size + 8) * scale;
        if (draw) {
          const x0 = alignX(row.align, side, paper);
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(x0, y, side, side);
          ctx.fillStyle = "#000000";
          for (let qy = 0; qy < m.size; qy++)
            for (let qx = 0; qx < m.size; qx++) if (m.dark(qx, qy)) ctx.fillRect(x0 + (qx + 4) * scale, y + (qy + 4) * scale, scale, scale);
        }
        y += side;
        break;
      }
      case "barcode": {
        const c = barcodeCanvas(row.content, row.height, row.showText);
        const w = Math.min(inner, c.width);
        const h = Math.round((c.height / c.width) * w);
        if (draw) ctx.drawImage(c, alignX(row.align, w, paper), y, w, h);
        y += h + 6;
        break;
      }
    }
  }
  return Math.ceil(y + padY);
}

// The receipt as a color picture, PAPER_DOTS wide (image mode, its preview and browser print).
// padY: blank space above and below (0 for one block of the designer preview).
export async function drawReceiptCanvas(rows: Row[], template: Template, padY = PAD): Promise<HTMLCanvasElement> {
  const families = rows.flatMap((r) => ("style" in r ? [r.style.fontFamily] : []));
  const [assets] = await Promise.all([loadAssets(rows), loadFonts(families)]);
  const paper = PAPER_DOTS[template.paperWidth];
  const measure = document.createElement("canvas").getContext("2d")!;
  const height = Math.max(1, paint(measure, rows, paper, assets, false, padY));
  const canvas = document.createElement("canvas");
  canvas.width = paper;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, paper, height);
  paint(ctx, rows, paper, assets, true, padY);
  return canvas;
}

export function canvasToRaster(canvas: HTMLCanvasElement): Raster {
  const ctx = canvas.getContext("2d")!;
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return ditherToRaster(rgbaToGray(data, canvas.width, canvas.height), canvas.width, canvas.height);
}

// ---------- text mode: pictures as rasters ----------

async function imageRaster(src: string, paperWidth: PaperWidth, widthPct: number, align: Align): Promise<Raster | undefined> {
  const img = await loadImage(src);
  if (!img) return undefined;
  const paper = PAPER_DOTS[paperWidth];
  const w = Math.max(8, Math.round((paper * widthPct) / 100));
  const h = Math.max(1, Math.round((img.naturalHeight / img.naturalWidth) * w));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  try {
    const gray = rgbaToGray(ctx.getImageData(0, 0, w, h).data, w, h);
    return placeOnPaper(ditherToRaster(gray, w, h), paper, align);
  } catch {
    return undefined; // the image host didn't allow reading its pixels
  }
}

// Prepares every picture a text-mode receipt needs, before encoding.
export async function prepareTextModeRasters(lines: PrintedLine[], paperWidth: PaperWidth): Promise<RasterFor> {
  const map = new Map<object, Raster>();
  await Promise.all(
    lines.map(async (l) => {
      if (l.kind === "qr") map.set(l, qrRaster(l.content, paperWidth, l.sizePct, l.align));
      if (l.kind === "image") {
        const r = await imageRaster(l.src, paperWidth, l.widthPct, l.align);
        if (r) map.set(l, r);
      }
    })
  );
  return (row) => map.get(row);
}
