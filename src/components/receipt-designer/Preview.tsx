"use client";

import { useEffect, useMemo, useState } from "react";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { ReceiptData } from "@/types/receipt";
import type { Template } from "@/lib/receipt-designer/types";
import { layoutReceipt, type Row } from "@/lib/receipt-designer/layout";
import { columnsFor, toPrintedLines, type ColumnOverride } from "@/lib/receipt-designer/textmode";
import { RECEIPT_CSS, textModeLinesHtml } from "@/lib/receipt-designer/html";
import { barcodeSvg } from "@/lib/receipt-designer/render";
import { drawReceiptCanvas } from "@/lib/receipt-designer/canvas";

// Preview ids are prefixed so they don't clash with the block list's own sortable ids.
export const PREVIEW_PREFIX = "pv:";

interface Segment {
  blockId: string | null; // null: lines that belong to no block (the required notice, the end feed)
  rows: Row[];
}

// Consecutive rows from the same block, in order: each becomes one draggable piece.
function segments(rows: Row[]): Segment[] {
  const out: Segment[] = [];
  for (const r of rows) {
    const id = r.blockId ?? null;
    const last = out[out.length - 1];
    if (last && last.blockId === id) last.rows.push(r);
    else out.push({ blockId: id, rows: [r] });
  }
  return out;
}

function Piece({ seg, index, selected, children }: { seg: Segment; index: number; selected: boolean; children: React.ReactNode }) {
  // Parts with no block (the required notice, the end feed) can't move; each still needs its own id.
  const sortable = useSortable({ id: seg.blockId ? `${PREVIEW_PREFIX}${seg.blockId}` : `${PREVIEW_PREFIX}free-${index}`, disabled: !seg.blockId });
  if (!seg.blockId) return <div className="select-none">{children}</div>;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = sortable;
  return (
    <div
      ref={setNodeRef}
      data-block={seg.blockId}
      {...attributes}
      {...listeners}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`rd-piece relative cursor-grab touch-none select-none rounded-sm outline-offset-1 ${isDragging ? "z-10 bg-white opacity-90 shadow-lg outline outline-2 outline-emerald-400" : ""} ${
        selected ? "outline outline-1 outline-emerald-400" : ""
      }`}
    >
      {children}
    </div>
  );
}

// The receipt as it will print, block by block. Click a block to edit it;
// drag it up or down to move it. Text mode shows the printer's character grid,
// image mode the exact picture.
export default function Preview({
  template,
  data,
  selectedId,
  onSelect,
  override,
}: {
  template: Template;
  data: ReceiptData;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  override?: ColumnOverride;
}) {
  const segs = useMemo(() => {
    try {
      return { ok: true as const, list: segments(layoutReceipt(template, data)) };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  }, [template, data]);

  const textHtml = useMemo(() => {
    if (template.printMode !== "TEXT" || !segs.ok) return [];
    return segs.list.map((s) => textModeLinesHtml(toPrintedLines(s.rows, template.paperWidth, override), template.paperWidth, { barcodeSvg, override }));
  }, [template, segs, override]);

  // Image mode: one picture per block, drawn exactly as on the printed receipt.
  const [images, setImages] = useState<{ key: string; srcs: string[] } | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const imageKey = template.printMode === "IMAGE" && segs.ok ? JSON.stringify([template, data]) : "";
  useEffect(() => {
    if (!imageKey || !segs.ok) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const srcs = await Promise.all(segs.list.map(async (s) => (await drawReceiptCanvas(s.rows, template, 0)).toDataURL("image/png")));
        if (!cancelled) {
          setImages({ key: imageKey, srcs });
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
  }, [imageKey, segs, template]);

  const paperPx = template.paperWidth === 58 ? 300 : 420;
  // Courier is 0.6em per character: this fills the paper (minus 8px padding) with exactly the printer's columns.
  const fontPx = (paperPx - 8) / (0.6 * columnsFor(template.paperWidth, "A", 1, override));
  const ids = segs.ok ? segs.list.filter((s) => s.blockId).map((s) => `${PREVIEW_PREFIX}${s.blockId}`) : [];

  return (
    <div className="flex flex-col items-center">
      <style>{`${RECEIPT_CSS}
.rd-preview .rd-piece:hover{background:rgba(16,185,129,.07)}`}</style>
      <div
        className="rd-preview relative bg-white shadow-[0_1px_3px_rgba(0,0,0,.12),0_8px_24px_rgba(0,0,0,.08)]"
        style={{ width: paperPx }}
        onClick={(e) => {
          const el = (e.target as HTMLElement).closest("[data-block]");
          onSelect(el?.getAttribute("data-block") ?? null);
        }}
      >
        {!segs.ok ? (
          <p className="p-3 text-xs text-red-600">Preview failed: {segs.error}</p>
        ) : template.printMode === "TEXT" ? (
          <div className="r-paper r-text overflow-hidden" style={{ width: "100%", fontSize: `${fontPx.toFixed(3)}px` }}>
            <SortableContext items={ids} strategy={verticalListSortingStrategy}>
              {segs.list.map((s, i) => (
                <Piece key={s.blockId ?? `free-${i}`} seg={s} index={i} selected={s.blockId === selectedId}>
                  <div dangerouslySetInnerHTML={{ __html: textHtml[i] ?? "" }} />
                </Piece>
              ))}
            </SortableContext>
          </div>
        ) : imageError ? (
          <p className="p-3 text-xs text-red-600">Preview failed: {imageError}</p>
        ) : images && images.srcs.length === segs.list.length ? (
          <div className="py-1.5">
            <SortableContext items={ids} strategy={verticalListSortingStrategy}>
              {segs.list.map((s, i) => (
                <Piece key={s.blockId ?? `free-${i}`} seg={s} index={i} selected={s.blockId === selectedId}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={images.srcs[i]} alt={i === 0 ? "Receipt preview" : ""} style={{ width: "100%", display: "block" }} draggable={false} />
                </Piece>
              ))}
            </SortableContext>
          </div>
        ) : (
          <p className="p-6 text-center text-xs text-zinc-400">Drawing preview…</p>
        )}
        {/* torn-paper edge */}
        <div className="absolute -bottom-2 left-0 h-2 w-full" style={{ background: "linear-gradient(-45deg,transparent 5px,#fff 0) 0 0/10px 10px repeat-x" }} />
      </div>
      <p className="mt-5 text-center text-[11px] text-zinc-400">
        {template.paperWidth}mm · {template.printMode === "TEXT" ? "Text mode: exactly the characters the printer prints" : "Image mode: exactly the picture the printer prints"}
        <br />
        Click a part to edit it · drag it to move it
      </p>
    </div>
  );
}
