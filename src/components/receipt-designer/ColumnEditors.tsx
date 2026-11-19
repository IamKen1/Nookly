"use client";

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import type { ReceiptData } from "@/types/receipt";
import type { Align, ItemCell, ItemField, ItemFormat, PrintMode, RowCell } from "@/lib/receipt-designer/types";
import { FIELDS_BY_NAME, TOTALS_FIELDS } from "@/lib/receipt-designer/totals";
import { ITEM_FIELD_NAMES, ITEM_FORMATS, newId, newItemCell, newRowCell } from "@/lib/receipt-designer/blocks";
import FormulaEditor from "./FormulaEditor";
import StyleEditor from "./StyleEditor";

const input = "h-8 w-full rounded-md border border-zinc-200 bg-white px-2 text-sm text-zinc-900 outline-none focus:border-emerald-500";
const small = "text-xs font-medium text-zinc-600";

const move = <T,>(list: T[], from: number, to: number) => {
  const next = [...list];
  const [x] = next.splice(from, 1);
  next.splice(to, 0, x);
  return next;
};

function AlignPick({ value, onChange }: { value: Align; onChange: (a: Align) => void }) {
  return (
    <div className="inline-flex overflow-hidden rounded-md border border-zinc-200">
      {(["left", "center", "right"] as Align[]).map((a) => (
        <button key={a} type="button" onClick={() => onChange(a)} className={`px-2 py-0.5 text-[11px] capitalize ${value === a ? "bg-emerald-600 text-white" : "bg-white text-zinc-600"}`}>
          {a}
        </button>
      ))}
    </div>
  );
}

function WidthPick({ value, onChange }: { value: number; onChange: (w: number) => void }) {
  return (
    <label className="flex items-center gap-1 text-[11px] text-zinc-500" title="0 = share the space that's left">
      Width
      <input
        type="number"
        min={0}
        max={100}
        value={value}
        onChange={(e) => onChange(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
        className="h-6 w-14 rounded border border-zinc-200 px-1 text-xs"
      />
      % {value === 0 && <span className="text-zinc-400">(auto)</span>}
    </label>
  );
}

function CellShell({
  title,
  index,
  count,
  onMove,
  onRemove,
  children,
}: {
  title: string;
  index: number;
  count: number;
  onMove: (to: number) => void;
  onRemove: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2 rounded-md border border-zinc-200 bg-white p-2">
      <div className="flex items-center gap-1">
        <span className="flex-1 text-xs font-semibold text-zinc-700">{title}</span>
        <button type="button" disabled={index === 0} onClick={() => onMove(index - 1)} className="p-0.5 text-zinc-400 hover:text-zinc-800 disabled:opacity-30" title="Move left">
          <ArrowUp className="h-3.5 w-3.5 -rotate-90" />
        </button>
        <button type="button" disabled={index === count - 1} onClick={() => onMove(index + 1)} className="p-0.5 text-zinc-400 hover:text-zinc-800 disabled:opacity-30" title="Move right">
          <ArrowDown className="h-3.5 w-3.5 -rotate-90" />
        </button>
        <button type="button" disabled={count === 1} onClick={onRemove} className="p-0.5 text-zinc-400 hover:text-red-600 disabled:opacity-30" title="Remove column">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      {children}
    </div>
  );
}

// ---------- Row: values side by side ----------

export function RowEditor({
  cells,
  gap,
  onChange,
  sample,
}: {
  cells: RowCell[];
  gap: number;
  onChange: (patch: { cells?: RowCell[]; gap?: number }) => void;
  sample?: ReceiptData | null;
}) {
  const update = (i: number, patch: Partial<RowCell>) => onChange({ cells: cells.map((c, j) => (j === i ? { ...c, ...patch } : c)) });
  return (
    <div className="space-y-2">
      <p className="text-[11px] text-zinc-500">Up to 4 columns on one line, left to right. Long text wraps inside its column.</p>
      {cells.map((c, i) => (
        <CellShell key={c.id} title={`Column ${i + 1}`} index={i} count={cells.length} onMove={(to) => onChange({ cells: move(cells, i, to) })} onRemove={() => onChange({ cells: cells.filter((_, j) => j !== i) })}>
          <select className={input} value={c.kind} onChange={(e) => update(i, { kind: e.target.value as RowCell["kind"] })}>
            <option value="field">A value from the sale</option>
            <option value="text">Text</option>
            <option value="formula">Formula</option>
          </select>
          {c.kind === "field" && (
            <>
              <select className={input} value={c.key} onChange={(e) => update(i, { key: e.target.value as RowCell["key"] })}>
                {FIELDS_BY_NAME.map((k) => (
                  <option key={k} value={k}>
                    {TOTALS_FIELDS[k].name}
                  </option>
                ))}
              </select>
              <input className={input} value={c.label} placeholder="Label before it (optional), e.g. Date:" onChange={(e) => update(i, { label: e.target.value })} />
              {TOTALS_FIELDS[c.key].format === "money" && (
                <label className="flex items-center gap-2 text-xs text-zinc-600">
                  <input type="checkbox" checked={c.minus} onChange={(e) => update(i, { minus: e.target.checked })} className="h-3.5 w-3.5 accent-emerald-600" /> Show as minus
                </label>
              )}
            </>
          )}
          {c.kind === "text" && <input className={input} value={c.text} placeholder="Text" onChange={(e) => update(i, { text: e.target.value })} />}
          {c.kind === "formula" && (
            <FormulaEditor showLayout={false} sample={sample} value={{ label: c.label, expr: c.expr, format: c.format, decimals: c.decimals }} onChange={(p) => update(i, p)} />
          )}
          <div className="flex flex-wrap items-center gap-2">
            <AlignPick value={c.align} onChange={(align) => update(i, { align })} />
            <WidthPick value={c.width} onChange={(width) => update(i, { width })} />
          </div>
        </CellShell>
      ))}
      <div className="flex items-center justify-between">
        <button
          type="button"
          disabled={cells.length >= 4}
          onClick={() => onChange({ cells: [...cells, newRowCell({ key: "totalDue", align: "right" })] })}
          className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 disabled:opacity-40"
        >
          <Plus className="h-3.5 w-3.5" /> Add column
        </button>
        <label className="flex items-center gap-1 text-[11px] text-zinc-500">
          Space between
          <select value={gap} onChange={(e) => onChange({ gap: Number(e.target.value) })} className="h-6 rounded border border-zinc-200 px-1 text-xs">
            {[0, 1, 2, 3, 4].map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}

// ---------- Items: how each item's line(s) look ----------

const ITEM_FIELDS = Object.keys(ITEM_FIELD_NAMES) as ItemField[];

export function ItemFormatEditor({ value, onChange, printMode }: { value: ItemFormat | null; onChange: (f: ItemFormat | null) => void; printMode: PrintMode }) {
  const lines = value?.lines ?? [];
  const setLines = (next: ItemFormat["lines"]) => onChange(next.length ? { lines: next } : null);
  const updateCell = (li: number, ci: number, patch: Partial<ItemCell>) =>
    setLines(lines.map((l, i) => (i === li ? { ...l, cells: l.cells.map((c, j) => (j === ci ? { ...c, ...patch } : c)) } : l)));

  return (
    <div className="space-y-2">
      <label className="block space-y-1">
        <span className={small}>Item lines</span>
        <select
          className={input}
          value=""
          onChange={(e) => {
            if (e.target.value === "standard") onChange(null);
            else if (e.target.value) onChange(ITEM_FORMATS.find((f) => f.key === e.target.value)!.make());
          }}
        >
          <option value="">{value ? "Your own columns (pick to start over)…" : "Standard (two lines)"}</option>
          <option value="standard">Standard: name, then qty × price … amount V</option>
          {ITEM_FORMATS.map((f) => (
            <option key={f.key} value={f.key}>
              {f.label}
            </option>
          ))}
        </select>
      </label>
      {!value && (
        <button type="button" onClick={() => onChange(ITEM_FORMATS[0].make())} className="text-xs font-semibold text-emerald-700">
          Customize the columns…
        </button>
      )}
      {lines.map((line, li) => (
        <div key={line.id} className="space-y-2 rounded-lg border border-zinc-200 bg-zinc-50/60 p-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-700">Line {li + 1} of each item</span>
            <button type="button" onClick={() => setLines(lines.filter((_, i) => i !== li))} className="text-[11px] text-zinc-500 hover:text-red-600">
              Remove line
            </button>
          </div>
          {line.cells.map((c, ci) => (
            <CellShell
              key={c.id}
              title={ITEM_FIELD_NAMES[c.field]}
              index={ci}
              count={line.cells.length}
              onMove={(to) => setLines(lines.map((l, i) => (i === li ? { ...l, cells: move(l.cells, ci, to) } : l)))}
              onRemove={() => setLines(lines.map((l, i) => (i === li ? { ...l, cells: l.cells.filter((_, j) => j !== ci) } : l)))}
            >
              <select className={input} value={c.field} onChange={(e) => updateCell(li, ci, { field: e.target.value as ItemField })}>
                {ITEM_FIELDS.map((f) => (
                  <option key={f} value={f}>
                    {ITEM_FIELD_NAMES[f]}
                  </option>
                ))}
              </select>
              {c.field === "text" && <input className={input} value={c.text} placeholder="Text" onChange={(e) => updateCell(li, ci, { text: e.target.value })} />}
              <input className={input} value={c.title} placeholder="Column title (header)" onChange={(e) => updateCell(li, ci, { title: e.target.value })} />
              <div className="flex flex-wrap items-center gap-2">
                <AlignPick value={c.align} onChange={(align) => updateCell(li, ci, { align })} />
                <WidthPick value={c.width} onChange={(width) => updateCell(li, ci, { width })} />
              </div>
            </CellShell>
          ))}
          <button
            type="button"
            disabled={line.cells.length >= 6}
            onClick={() => setLines(lines.map((l, i) => (i === li ? { ...l, cells: [...l.cells, newItemCell("total")] } : l)))}
            className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 disabled:opacity-40"
          >
            <Plus className="h-3.5 w-3.5" /> Add column
          </button>
          <details>
            <summary className="cursor-pointer text-[11px] font-medium text-zinc-500">Look of this line</summary>
            <div className="mt-2">
              <StyleEditor compact value={line.style} onChange={(style) => setLines(lines.map((l, i) => (i === li ? { ...l, style } : l)))} printMode={printMode} />
            </div>
          </details>
        </div>
      ))}
      {value && (
        <button
          type="button"
          disabled={lines.length >= 4}
          onClick={() => setLines([...lines, { id: newId("l"), style: {}, cells: [newItemCell("generic")] }])}
          className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 disabled:opacity-40"
        >
          <Plus className="h-3.5 w-3.5" /> Add a line to each item
        </button>
      )}
      <p className="text-[11px] text-zinc-400">The column titles print as the header when &quot;Column header&quot; is on.</p>
    </div>
  );
}
