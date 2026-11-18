"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReceiptData } from "@/types/receipt";
import type { Template } from "@/lib/receipt-designer/types";
import { layoutReceipt } from "@/lib/receipt-designer/layout";
import { toPrintedLines } from "@/lib/receipt-designer/textmode";
import { RECEIPT_CSS, textModeHtml } from "@/lib/receipt-designer/html";
import { barcodeSvg } from "@/lib/receipt-designer/render";
import { drawReceiptCanvas } from "@/lib/receipt-designer/canvas";

// The receipt as it will print. Text mode: the printer's character grid,
// where clicking a line selects its block. Image mode: the exact picture.
export default function Preview({
  template,
  data,
  selectedId,
  onSelect,
}: {
  template: Template;
  data: ReceiptData;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const textHtml = useMemo(() => {
    if (template.printMode !== "TEXT") return "";
    try {
      return textModeHtml(toPrintedLines(layoutReceipt(template, data), template.paperWidth), template.paperWidth, { barcodeSvg });
    } catch (e) {
      return `<p style="color:#b91c1c;padding:8px;font:12px sans-serif">Preview failed: ${String((e as Error).message).replace(/</g, "&lt;")}</p>`;
    }
  }, [template, data]);

  const [image, setImage] = useState<{ src: string; width: number } | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  useEffect(() => {
    if (template.printMode !== "IMAGE") return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const canvas = await drawReceiptCanvas(layoutReceipt(template, data), template);
        if (!cancelled) {
          setImage({ src: canvas.toDataURL("image/png"), width: canvas.width });
          setImageError(null);
        }
      } catch (e) {
        if (!cancelled) setImageError((e as Error).message);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [template, data]);

  const paperPx = template.paperWidth === 58 ? 300 : 420;

  return (
    <div className="flex flex-col items-center">
      <style>{`${RECEIPT_CSS}
.rd-preview .r-line,.rd-preview .r-pic{cursor:pointer;border-radius:2px}
.rd-preview .r-line:hover,.rd-preview .r-pic:hover{background:rgba(16,185,129,.08)}
${selectedId ? `.rd-preview [data-block="${selectedId.replace(/"/g, "")}"]{background:rgba(16,185,129,.18)}` : ""}`}</style>
      <div
        className="rd-preview relative bg-white shadow-[0_1px_3px_rgba(0,0,0,.12),0_8px_24px_rgba(0,0,0,.08)]"
        style={{ width: paperPx }}
        onClick={(e) => {
          const el = (e.target as HTMLElement).closest("[data-block]");
          onSelect(el?.getAttribute("data-block") ?? null);
        }}
      >
        {template.printMode === "TEXT" ? (
          <div
            className="overflow-hidden"
            // Courier is 0.6em per character: this size fills the paper (minus its 8px padding) with
            // exactly 32 (58mm) or 48 (80mm) columns. Set on the receipt element itself, so the
            // shared receipt CSS can't shrink it and leave the text bunched to the left.
            dangerouslySetInnerHTML={{
              __html: textHtml.replace(
                'class="r-paper r-text"',
                `class="r-paper r-text" style="width:100%;font-size:${((paperPx - 8) / (0.6 * (template.paperWidth === 58 ? 32 : 48))).toFixed(3)}px"`
              ),
            }}
          />
        ) : imageError ? (
          <p className="p-3 text-xs text-red-600">Preview failed: {imageError}</p>
        ) : image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image.src} alt="Receipt preview" style={{ width: "100%", imageRendering: "auto" }} />
        ) : (
          <p className="p-6 text-center text-xs text-zinc-400">Drawing preview…</p>
        )}
        {/* torn-paper edge */}
        <div className="absolute -bottom-2 left-0 h-2 w-full" style={{ background: "linear-gradient(-45deg,transparent 5px,#fff 0) 0 0/10px 10px repeat-x" }} />
      </div>
      <p className="mt-5 text-[11px] text-zinc-400">
        {template.paperWidth}mm · {template.printMode === "TEXT" ? "Text mode: exactly the characters the printer prints" : "Image mode: exactly the picture the printer prints"}
      </p>
    </div>
  );
}
