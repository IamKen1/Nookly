"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { ReceiptData } from "@/types/receipt";
import type { Block, Template } from "@/lib/receipt-designer/types";
import { layoutReceipt, type Row } from "@/lib/receipt-designer/layout";
import { columnsFor, toPrintedLines, type ColumnOverride } from "@/lib/receipt-designer/textmode";
import { RECEIPT_CSS, textModeLinesHtml } from "@/lib/receipt-designer/html";
import { barcodeSvg } from "@/lib/receipt-designer/render";
import { drawReceiptCanvas } from "@/lib/receipt-designer/canvas";
import { editableText, type Part } from "@/lib/receipt-designer/quick";

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

// Within a piece, consecutive rows of the same totals line (others: lineId undefined).
function lineGroups(rows: Row[]): { lineId: string | null; rows: Row[] }[] {
  const out: { lineId: string | null; rows: Row[] }[] = [];
  for (const r of rows) {
    const id = r.lineId ?? null;
    const last = out[out.length - 1];
    if (last && last.lineId === id) last.rows.push(r);
    else out.push({ lineId: id, rows: [r] });
  }
  return out;
}

function Piece({ seg, index, selected, children }: { seg: Segment; index: number; selected: boolean; children: React.ReactNode }) {
  // Parts with no block (the required notice, the end feed) can't move; each still needs its own id.
  const sortable = useSortable({ id: seg.blockId ? `${PREVIEW_PREFIX}${seg.blockId}` : `${PREVIEW_PREFIX}free-${index}`, disabled: !seg.blockId });
  if (!seg.blockId) return <div className="select-none" title="Required on every receipt">{children}</div>;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = sortable;
  return (
    <div
      ref={setNodeRef}
      data-block={seg.blockId}
      {...attributes}
      {...listeners}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`rd-piece relative cursor-grab touch-none select-none rounded-sm outline-offset-1 ${isDragging ? "z-10 bg-white opacity-90 shadow-lg outline outline-2 outline-emerald-400" : ""} ${
        selected ? "rd-selected" : ""
      }`}
    >
      {children}
    </div>
  );
}

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

// The receipt as it will print, block by block. Click a part to select it (a
// toolbar appears), double-click text to edit it there, drag to move it.
// Text mode shows the printer's character grid, image mode the exact picture.
export default function Preview({
  template,
  data,
  selected,
  onSelect,
  onBlockChange,
  toolbar,
  override,
  interactive = true,
}: {
  template: Template;
  data: ReceiptData;
  selected: Part | null;
  onSelect: (p: Part | null) => void;
  onBlockChange?: (b: Block) => void;
  // The toolbar for the selected part; `edit` starts editing its text in place.
  toolbar?: (edit: () => void, placement: "above" | "below") => React.ReactNode;
  override?: ColumnOverride;
  interactive?: boolean;
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
    return segs.list.map((s) =>
      lineGroups(s.rows).map((g) => ({ lineId: g.lineId, html: textModeLinesHtml(toPrintedLines(g.rows, template.paperWidth, override), template.paperWidth, { barcodeSvg, override }) }))
    );
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

  // ---------- where the selected part is, for the toolbar and the text editor ----------
  const paperRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<Box | null>(null);
  const selectedBlock = selected ? template.blocks.find((b) => b.id === selected.blockId) ?? null : null;
  useLayoutEffect(() => {
    const measure = () => {
      const paper = paperRef.current;
      if (!paper || !selected) return setBox(null);
      const piece = paper.querySelector<HTMLElement>(`[data-block="${CSS_ESCAPE(selected.blockId)}"].rd-piece`);
      const el = (selected.lineId && piece?.querySelector<HTMLElement>(`[data-line="${CSS_ESCAPE(selected.lineId)}"]`)) || piece;
      if (!el) return setBox(null);
      const p = paper.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      setBox({ top: r.top - p.top, left: r.left - p.left, width: r.width, height: r.height });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [selected, textHtml, images]);

  // ---------- editing text in place ----------
  const [editing, setEditing] = useState<{ part: Part; value: string } | null>(null);
  const startEdit = (part: Part | null = selected) => {
    const b = part && template.blocks.find((x) => x.id === part.blockId);
    const t = b ? editableText(b, part!.lineId) : null;
    if (part && t) setEditing({ part, value: t.value });
  };
  const commit = () => {
    if (!editing) return;
    const b = template.blocks.find((x) => x.id === editing.part.blockId);
    const t = b ? editableText(b, editing.part.lineId) : null;
    if (t && t.value !== editing.value) onBlockChange?.(t.apply(editing.value));
    setEditing(null);
  };
  const editingText = editing && selectedBlock ? editableText(selectedBlock, editing.part.lineId) : null;

  const lastClick = useRef<{ part: Part | null; at: number }>({ part: null, at: 0 });
  const partAt = (target: EventTarget): Part | null => {
    const el = (target as HTMLElement).closest("[data-block].rd-piece");
    if (!el) return null;
    const line = (target as HTMLElement).closest("[data-line]");
    return { blockId: el.getAttribute("data-block")!, lineId: line?.getAttribute("data-line") ?? null };
  };

  const paperPx = template.paperWidth === 58 ? 300 : 420;
  // Courier is 0.6em per character: this fills the paper (minus 8px padding) with exactly the printer's columns.
  const fontPx = (paperPx - 8) / (0.6 * columnsFor(template.paperWidth, "A", 1, override));
  const ids = segs.ok ? segs.list.filter((s) => s.blockId).map((s) => `${PREVIEW_PREFIX}${s.blockId}`) : [];
  const isSel = (blockId: string | null, lineId: string | null = null) =>
    Boolean(selected && blockId === selected.blockId && (selected.lineId ?? null) === lineId);

  return (
    <div className="flex flex-col items-center">
      <style>{`${RECEIPT_CSS}
.rd-preview .rd-piece:hover,.rd-preview [data-line]:hover{background:rgba(16,185,129,.08)}
.rd-preview .rd-selected,.rd-preview [data-line].rd-selected{outline:2px solid #10b981;outline-offset:1px;background:rgba(16,185,129,.06)}`}</style>
      <div
        ref={paperRef}
        className="rd-preview relative bg-white shadow-[0_1px_3px_rgba(0,0,0,.12),0_8px_24px_rgba(0,0,0,.08)]"
        style={{ width: paperPx }}
        onClick={(e) => {
          if (!interactive) return;
          const p = partAt(e.target);
          // Two quick clicks on the same part = edit its text. (The browser's own
          // dblclick doesn't fire: the first click re-renders the selected part.)
          const last = lastClick.current;
          const same = p && last.part && last.part.blockId === p.blockId && (last.part.lineId ?? null) === (p.lineId ?? null);
          lastClick.current = { part: p, at: e.timeStamp };
          onSelect(p);
          if (p && same && e.timeStamp - last.at < 450) startEdit(p);
        }}
      >
        {!segs.ok ? (
          <p className="p-3 text-xs text-red-600">Preview failed: {segs.error}</p>
        ) : template.printMode === "TEXT" ? (
          <div className="r-paper r-text overflow-hidden" style={{ width: "100%", fontSize: `${fontPx.toFixed(3)}px` }}>
            <SortableContext items={ids} strategy={verticalListSortingStrategy} disabled={!interactive}>
              {segs.list.map((s, i) => (
                <Piece key={s.blockId ?? `free-${i}`} seg={s} index={i} selected={isSel(s.blockId)}>
                  {(textHtml[i] ?? []).map((g, j) =>
                    g.lineId ? (
                      <div key={g.lineId + j} data-line={g.lineId} className={`rounded-sm ${isSel(s.blockId, g.lineId) ? "rd-selected" : ""}`} dangerouslySetInnerHTML={{ __html: g.html }} />
                    ) : (
                      <div key={j} dangerouslySetInnerHTML={{ __html: g.html }} />
                    )
                  )}
                </Piece>
              ))}
            </SortableContext>
          </div>
        ) : imageError ? (
          <p className="p-3 text-xs text-red-600">Preview failed: {imageError}</p>
        ) : images && images.srcs.length === segs.list.length ? (
          <div className="py-1.5">
            <SortableContext items={ids} strategy={verticalListSortingStrategy} disabled={!interactive}>
              {segs.list.map((s, i) => (
                <Piece key={s.blockId ?? `free-${i}`} seg={s} index={i} selected={isSel(s.blockId)}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={images.srcs[i]} alt={i === 0 ? "Receipt preview" : ""} style={{ width: "100%", display: "block" }} draggable={false} />
                </Piece>
              ))}
            </SortableContext>
          </div>
        ) : (
          <p className="p-6 text-center text-xs text-zinc-400">Drawing preview…</p>
        )}

        {/* toolbar over the selected part (below it when there's no room above) */}
        {interactive && box && selectedBlock && toolbar && !editing && (
          <div className="pointer-events-none absolute left-0 right-0" style={{ top: box.top < 90 ? box.top + box.height : box.top }}>
            <div className="pointer-events-auto relative mx-auto" style={{ width: paperPx }}>
              {toolbar(() => startEdit(), box.top < 90 ? "below" : "above")}
            </div>
          </div>
        )}

        {/* editing text in place */}
        {editing && box && editingText && (
          <div className="absolute z-40" style={{ top: box.top - 4, left: 4, right: 4 }} onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
            <div className="rounded-lg border-2 border-emerald-500 bg-white p-1.5 shadow-xl">
              <p className="mb-1 font-sans text-[10px] font-semibold uppercase tracking-wide text-emerald-700">{editingText.label}</p>
              {editingText.multiline ? (
                <textarea
                  autoFocus
                  rows={Math.min(6, Math.max(2, editing.value.split("\n").length + 1))}
                  className="w-full resize-none rounded border border-zinc-200 p-1 font-mono text-xs outline-none"
                  value={editing.value}
                  onChange={(e) => setEditing({ ...editing, value: e.target.value })}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === "Escape") setEditing(null);
                    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) commit();
                  }}
                  onBlur={commit}
                />
              ) : (
                <input
                  autoFocus
                  className="h-7 w-full rounded border border-zinc-200 px-1 font-mono text-xs outline-none"
                  value={editing.value}
                  onChange={(e) => setEditing({ ...editing, value: e.target.value })}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === "Escape") setEditing(null);
                    if (e.key === "Enter") commit();
                  }}
                  onBlur={commit}
                />
              )}
              <p className="mt-1 font-sans text-[10px] text-zinc-400">
                {editingText.multiline ? "Ctrl+Enter to save" : "Enter to save"} · Esc to cancel · values like {"{quantity}"} work here
              </p>
            </div>
          </div>
        )}

        {/* torn-paper edge */}
        <div className="absolute -bottom-2 left-0 h-2 w-full" style={{ background: "linear-gradient(-45deg,transparent 5px,#fff 0) 0 0/10px 10px repeat-x" }} />
      </div>
      {interactive && (
        <p className="mt-5 text-center text-[11px] text-zinc-400">
          {template.paperWidth}mm · {template.printMode === "TEXT" ? "Text mode: exactly the characters the printer prints" : "Image mode: exactly the picture the printer prints"}
          <br />
          Click a part to change it · double-click text to edit it · drag to move it
        </p>
      )}
    </div>
  );
}

const CSS_ESCAPE = (s: string) => (typeof window !== "undefined" && window.CSS?.escape ? window.CSS.escape(s) : s.replace(/["\\]/g, "\\$&"));
