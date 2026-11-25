"use client";

import { AlignCenter, AlignLeft, AlignRight, ArrowDown, ArrowUp, Bold, Copy, Minus, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import type { Block, PrintMode, Style, TotalsKey } from "@/lib/receipt-designer/types";
import { FIELDS_BY_NAME, TOTALS_FIELDS } from "@/lib/receipt-designer/totals";
import { editableText, partAlign, partName, partSource, partStyle, setPartAlign, setPartSource, setPartStyle } from "@/lib/receipt-designer/quick";
import { FORMULA_VARIABLES, formulaError } from "@/lib/receipt-designer/formula";

export type BlockAction = "up" | "down" | "duplicate" | "delete" | "more";

// The little toolbar over the selected part of the receipt.
export default function QuickBar({
  block,
  lineId,
  printMode,
  onChange,
  onAction,
  onEditText,
  placement = "above",
}: {
  block: Block;
  lineId: string | null;
  printMode: PrintMode;
  onChange: (b: Block) => void;
  onAction: (a: BlockAction) => void;
  onEditText: () => void;
  placement?: "above" | "below";
}) {
  const style = partStyle(block, lineId);
  const setStyle = (patch: Style) => onChange(setPartStyle(block, lineId, { ...style, ...patch }));
  const align = partAlign(block, lineId);
  const source = partSource(block, lineId);
  const canEdit = editableText(block, lineId) !== null;
  const noAlign = block.type === "rule" || block.type === "barcode" || block.type === "items" || block.type === "row";

  // Bigger / smaller: printer sizes in text mode, points in image mode.
  const size = printMode === "TEXT" ? style.sizeH ?? 1 : style.fontSize ?? 9;
  const resize = (dir: 1 | -1) =>
    printMode === "TEXT"
      ? setStyle({ sizeW: Math.min(4, Math.max(1, (style.sizeW ?? 1) + dir)), sizeH: Math.min(4, Math.max(1, (style.sizeH ?? 1) + dir)) })
      : setStyle({ fontSize: Math.min(48, Math.max(6, (style.fontSize ?? 9) + dir)) });

  const btn = (on: boolean) =>
    `inline-flex h-7 min-w-7 items-center justify-center rounded-md px-1.5 text-xs font-semibold transition ${on ? "bg-emerald-600 text-white" : "text-zinc-700 hover:bg-zinc-100"}`;
  const sep = <span className="mx-0.5 h-5 w-px bg-zinc-200" />;

  return (
    <div
      className={`rd-quickbar absolute left-1/2 z-30 -translate-x-1/2 cursor-default ${placement === "above" ? "bottom-full mb-2" : "top-full mt-2"}`}
      // Clicks and keys here are for the toolbar, not for dragging or selecting the part.
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <div className="flex flex-col items-center gap-1">
        <div className="flex items-center gap-0.5 whitespace-nowrap rounded-xl border border-zinc-200 bg-white p-1 font-sans shadow-lg">
          <span className="max-w-[9rem] truncate px-1.5 text-[11px] font-semibold text-emerald-700">{partName(block, lineId)}</span>
          {sep}
          {canEdit && (
            <button type="button" className={btn(false)} onClick={onEditText} title="Edit the text (or double-click it)">
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}
          {block.type !== "rule" && block.type !== "barcode" && block.type !== "logo" && block.type !== "qr" && (
            <>
              <button type="button" className={btn(style.bold === true)} onClick={() => setStyle({ bold: !style.bold })} title="Bold">
                <Bold className="h-3.5 w-3.5" />
              </button>
              <button type="button" className={btn(style.uppercase === true)} onClick={() => setStyle({ uppercase: !style.uppercase })} title="ALL CAPS">
                AA
              </button>
              <button type="button" className={btn(false)} onClick={() => resize(-1)} title="Smaller" disabled={size <= (printMode === "TEXT" ? 1 : 6)}>
                <Minus className="h-3.5 w-3.5" />
              </button>
              <span className="w-6 text-center text-[11px] text-zinc-500">{printMode === "TEXT" ? `${size}×` : size}</span>
              <button type="button" className={btn(false)} onClick={() => resize(1)} title="Bigger">
                <Plus className="h-3.5 w-3.5" />
              </button>
            </>
          )}
          {!noAlign && (
            <>
              {sep}
              {(["left", "center", "right"] as const).map((a) => {
                const Icon = a === "left" ? AlignLeft : a === "center" ? AlignCenter : AlignRight;
                return (
                  <button key={a} type="button" className={btn(align === a)} onClick={() => onChange(setPartAlign(block, lineId, a))} title={`Align ${a}`}>
                    <Icon className="h-3.5 w-3.5" />
                  </button>
                );
              })}
            </>
          )}
          {sep}
          <button type="button" className={btn(false)} onClick={() => onAction("up")} title="Move up">
            <ArrowUp className="h-3.5 w-3.5" />
          </button>
          <button type="button" className={btn(false)} onClick={() => onAction("down")} title="Move down">
            <ArrowDown className="h-3.5 w-3.5" />
          </button>
          <button type="button" className={btn(false)} onClick={() => onAction("duplicate")} title="Duplicate">
            <Copy className="h-3.5 w-3.5" />
          </button>
          <button type="button" className={`${btn(false)} hover:!bg-red-50 hover:text-red-600`} onClick={() => onAction("delete")} title={lineId ? "Remove this line" : "Remove"}>
            <Trash2 className="h-3.5 w-3.5" />
          </button>
          <button type="button" className={btn(false)} onClick={() => onAction("more")} title="All settings">
            <MoreHorizontal className="h-3.5 w-3.5" />
          </button>
        </div>

        {source && (
          <div className="flex items-center gap-1.5 whitespace-nowrap rounded-xl border border-emerald-200 bg-emerald-50 px-2 py-1 font-sans text-[11px] text-emerald-900 shadow">
            <span className="font-semibold">Shows</span>
            <select
              className="h-6 max-w-[11rem] rounded border border-emerald-200 bg-white px-1 text-[11px]"
              value={source.kind === "field" ? source.key : "__formula"}
              onChange={(e) =>
                onChange(
                  setPartSource(
                    block,
                    lineId,
                    e.target.value === "__formula" ? { kind: "formula", expr: source.kind === "field" ? fieldVariable(source.key) : source.expr, format: "money" } : { kind: "field", key: e.target.value as TotalsKey }
                  )
                )
              }
            >
              {FIELDS_BY_NAME.map((k) => (
                <option key={k} value={k}>
                  {TOTALS_FIELDS[k].name}
                </option>
              ))}
              <option value="__formula">ƒ My own formula…</option>
            </select>
            {source.kind === "formula" && (
              <input
                className={`h-6 w-40 rounded border bg-white px-1 font-mono text-[11px] ${formulaError(source.expr) ? "border-red-400" : "border-emerald-200"}`}
                value={source.expr}
                title={formulaError(source.expr) ?? "e.g. subtotal - vatRemoved"}
                onChange={(e) => onChange(setPartSource(block, lineId, { ...source, expr: e.target.value }))}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// The formula name of a value, to start a formula from it ("total" for Total amount due).
function fieldVariable(key: TotalsKey): string {
  return Object.entries(FORMULA_VARIABLES).find(([, v]) => v.key === key)?.[0] ?? "total";
}
