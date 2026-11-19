"use client";

import { useRef } from "react";
import type { ReceiptData } from "@/types/receipt";
import type { FieldLayout, FormulaFormat } from "@/lib/receipt-designer/types";
import { FORMULA_FUNCTIONS, FORMULA_VARIABLES, computeFormula, formatFormula, formulaError } from "@/lib/receipt-designer/formula";
import { peso } from "@/lib/receipt";

export interface FormulaValue {
  label: string;
  expr: string;
  format: FormulaFormat;
  decimals: number;
  layout?: FieldLayout;
  minus?: boolean;
  hideWhenZero?: boolean;
}

const input = "h-8 w-full rounded-md border border-zinc-200 bg-white px-2 text-sm text-zinc-900 outline-none focus:border-emerald-500";

const EXAMPLES: { label: string; expr: string; format: FormulaFormat; decimals: number }[] = [
  { label: "VAT-exclusive total:", expr: "total / 1.12", format: "money", decimals: 2 },
  { label: "You saved:", expr: "round(savings / subtotal * 100, 0)", format: "percent", decimals: 0 },
  { label: "Points worth:", expr: "pointsBalance * 1", format: "money", decimals: 2 },
  { label: "Avg per item:", expr: "subtotal / pieces", format: "money", decimals: 2 },
  { label: "Free delivery in:", expr: "if(total < 500, 500 - total, 0)", format: "money", decimals: 2 },
];

// Write a formula from the sale's values. Shows the result on the preview sale
// as you type, and what's wrong if it can't be read.
export default function FormulaEditor({
  value,
  onChange,
  sample,
  showLayout = true,
}: {
  value: FormulaValue;
  onChange: (patch: Partial<FormulaValue>) => void;
  sample?: ReceiptData | null;
  showLayout?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const error = formulaError(value.expr);
  const result = !error && sample ? computeFormula(value.expr, sample) : null;

  const insert = (text: string) => {
    const el = ref.current;
    const start = el?.selectionStart ?? value.expr.length;
    const end = el?.selectionEnd ?? value.expr.length;
    const before = value.expr.slice(0, start);
    const spaced = (before && !/[\s(]$/.test(before) ? " " : "") + text;
    onChange({ expr: before + spaced + value.expr.slice(end) });
    requestAnimationFrame(() => {
      el?.focus();
      const pos = start + spaced.length;
      el?.setSelectionRange(pos, pos);
    });
  };

  return (
    <div className="space-y-2">
      <label className="block space-y-1">
        <span className="text-xs font-medium text-zinc-600">Label</span>
        <input className={input} value={value.label} placeholder="(no label)" onChange={(e) => onChange({ label: e.target.value })} />
      </label>
      <label className="block space-y-1">
        <span className="text-xs font-medium text-zinc-600">Formula</span>
        <textarea
          ref={ref}
          rows={2}
          spellCheck={false}
          value={value.expr}
          onChange={(e) => onChange({ expr: e.target.value })}
          className={`w-full rounded-md border bg-white px-2 py-1.5 font-mono text-sm outline-none ${error ? "border-red-300 focus:border-red-500" : "border-zinc-200 focus:border-emerald-500"}`}
        />
      </label>
      {error ? (
        <p className="text-xs text-red-600">{error}</p>
      ) : (
        <p className="text-xs text-emerald-700">
          On the preview sale: <strong>{result === null ? "not shown (a value doesn't apply to this sale)" : formatFormula(result, value.format, value.decimals, peso)}</strong>
        </p>
      )}

      <div>
        <p className="mb-1 text-[11px] font-medium text-zinc-500">Values (click to insert)</p>
        <div className="flex max-h-28 flex-wrap gap-1 overflow-y-auto">
          {Object.entries(FORMULA_VARIABLES).map(([name, v]) => (
            <button key={name} type="button" title={v.name} onClick={() => insert(name)} className="rounded border border-zinc-200 px-1.5 py-0.5 font-mono text-[11px] text-zinc-700 hover:border-emerald-300 hover:bg-emerald-50">
              {name}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-[11px] leading-snug text-zinc-400">
          + − × ÷ % ( ), compare with &gt; &lt; &gt;= &lt;= == !=, and / or / not, and {FORMULA_FUNCTIONS.join(", ")}.
        </p>
      </div>

      <details className="text-[11px] text-zinc-500">
        <summary className="cursor-pointer font-medium text-zinc-600">Examples</summary>
        <div className="mt-1 space-y-1">
          {EXAMPLES.map((ex) => (
            <button key={ex.expr} type="button" onClick={() => onChange(ex)} className="block w-full rounded border border-zinc-100 px-2 py-1 text-left hover:bg-zinc-50">
              <span className="text-zinc-700">{ex.label}</span> <code className="text-emerald-700">{ex.expr}</code>
            </button>
          ))}
        </div>
      </details>

      <div className="grid grid-cols-2 gap-2">
        <label className="block space-y-1">
          <span className="text-xs font-medium text-zinc-600">Show as</span>
          <select className={input} value={value.format} onChange={(e) => onChange({ format: e.target.value as FormulaFormat })}>
            <option value="money">Pesos (₱)</option>
            <option value="number">Number</option>
            <option value="percent">Percent (%)</option>
            <option value="int">Whole number</option>
          </select>
        </label>
        {(value.format === "number" || value.format === "percent") && (
          <label className="block space-y-1">
            <span className="text-xs font-medium text-zinc-600">Decimals</span>
            <input type="number" min={0} max={6} className={input} value={value.decimals} onChange={(e) => onChange({ decimals: Number(e.target.value) || 0 })} />
          </label>
        )}
      </div>
      {showLayout && (
        <label className="block space-y-1">
          <span className="text-xs font-medium text-zinc-600">Line</span>
          <select className={input} value={value.layout ?? "pair"} onChange={(e) => onChange({ layout: e.target.value as FieldLayout })}>
            <option value="pair">Label left, value right</option>
            <option value="inline">Label: value</option>
            <option value="value">Value only</option>
          </select>
        </label>
      )}
      {value.minus !== undefined && value.format === "money" && (
        <label className="flex items-center gap-2 text-sm text-zinc-700">
          <input type="checkbox" checked={value.minus} onChange={(e) => onChange({ minus: e.target.checked })} className="h-4 w-4 accent-emerald-600" /> Show as minus (−₱)
        </label>
      )}
      {value.hideWhenZero !== undefined && (
        <label className="flex items-center gap-2 text-sm text-zinc-700">
          <input type="checkbox" checked={value.hideWhenZero} onChange={(e) => onChange({ hideWhenZero: e.target.checked })} className="h-4 w-4 accent-emerald-600" /> Hide when zero
        </label>
      )}
      <p className="text-[11px] text-zinc-400">Display only: a formula never changes what was charged, the drawer or reports.</p>
    </div>
  );
}
