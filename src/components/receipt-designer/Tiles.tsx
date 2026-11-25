"use client";

import { useMemo, useState } from "react";
import { useDraggable } from "@dnd-kit/core";
import { Plus, Search } from "lucide-react";
import type { ReceiptData } from "@/types/receipt";
import type { Template } from "@/lib/receipt-designer/types";
import { layoutReceipt } from "@/lib/receipt-designer/layout";
import { toPrintedLines } from "@/lib/receipt-designer/textmode";
import { TILES, TILE_CATEGORIES, type Tile, type TileCategory } from "@/lib/receipt-designer/tiles";

// Full class names so Tailwind keeps them.
const COLORS: Record<string, { chip: string; tile: string; dot: string }> = {
  amber: { chip: "bg-amber-100 text-amber-900", tile: "border-amber-200 bg-amber-50/70 hover:border-amber-400", dot: "bg-amber-400" },
  sky: { chip: "bg-sky-100 text-sky-900", tile: "border-sky-200 bg-sky-50/70 hover:border-sky-400", dot: "bg-sky-400" },
  violet: { chip: "bg-violet-100 text-violet-900", tile: "border-violet-200 bg-violet-50/70 hover:border-violet-400", dot: "bg-violet-400" },
  emerald: { chip: "bg-emerald-100 text-emerald-900", tile: "border-emerald-200 bg-emerald-50/70 hover:border-emerald-400", dot: "bg-emerald-500" },
  blue: { chip: "bg-blue-100 text-blue-900", tile: "border-blue-200 bg-blue-50/70 hover:border-blue-400", dot: "bg-blue-400" },
  rose: { chip: "bg-rose-100 text-rose-900", tile: "border-rose-200 bg-rose-50/70 hover:border-rose-400", dot: "bg-rose-400" },
  yellow: { chip: "bg-yellow-100 text-yellow-900", tile: "border-yellow-200 bg-yellow-50/70 hover:border-yellow-400", dot: "bg-yellow-400" },
  zinc: { chip: "bg-zinc-200 text-zinc-800", tile: "border-zinc-200 bg-zinc-50 hover:border-zinc-400", dot: "bg-zinc-400" },
};
const colorOf = (c: TileCategory) => COLORS[TILE_CATEGORIES.find((x) => x.key === c)!.color];

// What a tile prints with the preview sale, as a few lines of printer text.
function tilePreview(tile: Tile, template: Template, data: ReceiptData | null): string[] {
  if (!data) return [];
  try {
    const rows = layoutReceipt({ ...template, paperWidth: 58, blocks: tile.make() }, data).filter((r) => r.blockId);
    return toPrintedLines(rows, 58)
      .flatMap((l) => (l.kind === "text" ? [l.text.trimEnd()] : l.kind === "image" ? ["[ logo ]"] : l.kind === "qr" ? ["[ QR code ]"] : l.kind === "barcode" ? ["║▌║█║▌│║▌║"] : []))
      .filter((l, i, all) => l.trim() || (i > 0 && i < all.length - 1))
      .slice(0, 3);
  } catch {
    return [];
  }
}

export default function Tiles({ template, sample, onAdd }: { template: Template; sample: ReceiptData | null; onAdd: (tile: Tile) => void }) {
  const [category, setCategory] = useState<TileCategory | "all">("all");
  const [search, setSearch] = useState("");
  // Only what changes how a tile looks: the sample sale and the receipt-wide look.
  const { theme, printMode } = template;
  const previews = useMemo(
    () => new Map(TILES.map((t) => [t.id, tilePreview(t, { version: 1, paperWidth: 58, printMode, theme, blocks: [] }, sample)])),
    [sample, printMode, theme]
  );
  const q = search.trim().toLowerCase();
  const shown = TILES.filter((t) => (category === "all" || t.category === category) && (!q || t.label.toLowerCase().includes(q)));

  return (
    <div className="flex min-h-0 flex-col">
      <div className="relative mb-2">
        <Search className="pointer-events-none absolute left-2 top-2 h-4 w-4 text-zinc-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Find a piece: total, change, date…"
          className="h-8 w-full rounded-lg border border-zinc-200 pl-8 pr-2 text-xs outline-none focus:border-emerald-500"
        />
      </div>
      <div className="mb-2 flex flex-wrap gap-1">
        <button type="button" onClick={() => setCategory("all")} className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${category === "all" ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-600"}`}>
          All
        </button>
        {TILE_CATEGORIES.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => setCategory(c.key)}
            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${category === c.key ? "ring-2 ring-zinc-900 " : ""}${COLORS[c.color].chip}`}
            title={c.label}
          >
            {c.emoji} {c.label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1">
        {shown.length === 0 && <p className="py-4 text-center text-xs text-zinc-400">Nothing called &quot;{search}&quot;.</p>}
        {shown.map((t) => (
          <TileCard key={t.id} tile={t} preview={previews.get(t.id) ?? []} onAdd={() => onAdd(t)} />
        ))}
      </div>
      <p className="mt-2 text-center text-[10px] text-zinc-400">Click a piece to add it, or drag it onto the receipt.</p>
    </div>
  );
}

function TileCard({ tile, preview, onAdd }: { tile: Tile; preview: string[]; onAdd: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `new:${tile.id}` });
  const c = colorOf(tile.category);
  const cat = TILE_CATEGORIES.find((x) => x.key === tile.category)!;
  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={onAdd}
      {...attributes}
      {...listeners}
      className={`group block w-full touch-manipulation rounded-xl border-2 p-2 text-left transition hover:-translate-y-0.5 hover:shadow-md active:scale-[.98] ${c.tile} ${isDragging ? "opacity-40" : ""}`}
    >
      <div className="flex items-center gap-1.5">
        <span className="text-sm leading-none">{cat.emoji}</span>
        <span className="min-w-0 flex-1 truncate text-xs font-semibold text-zinc-800">{tile.label}</span>
        <Plus className="h-3.5 w-3.5 shrink-0 text-zinc-400 group-hover:text-zinc-800" />
      </div>
      {preview.length > 0 ? (
        <pre className="mt-1.5 overflow-hidden rounded-md bg-white px-1.5 py-1 font-mono text-[8.5px] leading-[1.25] text-zinc-700 shadow-inner">{preview.join("\n")}</pre>
      ) : (
        <p className="mt-1 text-[10px] italic text-zinc-500">{tile.hint ?? "Shows when it applies to the sale"}</p>
      )}
      {preview.length > 0 && tile.hint && <p className="mt-0.5 text-[10px] text-zinc-500">{tile.hint}</p>}
    </button>
  );
}
