"use client";

import { Calculator } from "lucide-react";
import type { ReceiptData } from "@/types/receipt";
import type { Block, TotalsKey, TotalsLine } from "@/lib/receipt-designer/types";
import { fillLabel, TOTALS_FIELDS } from "@/lib/receipt-designer/totals";
import {
  computationAsLines,
  explainComputation,
  explainKey,
  explainPart,
  fieldAsFormula,
  impliedVat,
  posTargetOf,
  valueLineAsFormula,
  withNumbers,
  type Explanation,
} from "@/lib/receipt-designer/explain";
import { computeFormula, formulaError } from "@/lib/receipt-designer/formula";

// A change on the receipt that can also change what the POS charges.
export type PosRequest =
  | { kind: "formula"; label: string; expr: string }
  | { kind: "discount"; label: string }
  | { kind: "rounding" }
  | { kind: "vat"; rate: number | null; seniorVatFirst: boolean | null; label: string };

interface Item {
  e: Explanation;
  action?: { label: string; run: () => Block };
  pos?: PosRequest | "follows"; // follows: nothing separate to apply at the POS
}

// "Apply to the POS too?" for a formula made from a value ("Change how it's computed").
function posFor(replaces: TotalsKey | undefined, label: string, expr: string, sample: ReceiptData): Item["pos"] {
  if (!replaces) return undefined; // the owner's own formula: "Charge customers this amount…" below
  const name = fillLabel(label, sample).replace(/:\s*$/, "").trim() || TOTALS_FIELDS[replaces].name;
  switch (posTargetOf(replaces)) {
    case "formula":
      return { kind: "formula", label: name, expr };
    case "discount":
      return { kind: "discount", label: name };
    case "rounding":
      return { kind: "rounding" };
    case "vat":
      return { kind: "vat", label: name, ...impliedVat(replaces, computeFormula(expr, sample), sample) };
    default:
      return "follows";
  }
}

// "How is this computed?": the selected part's amounts, step by step with the
// sale in the preview, and a way to change each computation.
export default function Explain({
  block,
  lineId,
  sample,
  onChange,
  onApplyToPos,
}: {
  block: Block;
  lineId: string | null;
  sample: ReceiptData | null;
  onChange: (b: Block) => void;
  onApplyToPos?: (r: PosRequest) => void;
}) {
  if (!sample) return null;
  const items: Item[] = [];

  if (block.type === "totals") {
    const lines = lineId ? block.lines.filter((l) => l.id === lineId) : block.lines;
    const replace = (id: string, next: TotalsLine[]): Block => ({ ...block, lines: block.lines.flatMap((l) => (l.id === id ? next : [l])) });
    for (const l of lines) {
      if (l.kind === "value") {
        const e = explainKey(l.key, sample);
        items.push({
          e,
          ...(e.formula && TOTALS_FIELDS[l.key].format === "money"
            ? { action: { label: "Change how it's computed", run: () => replace(l.id, [valueLineAsFormula(l, e.formula!)]) } }
            : {}),
        });
      } else if (l.kind === "formula" || l.kind === "computation") {
        const [e] = explainPart({ ...block, lines: [l] }, l.id, sample);
        if (!e) continue;
        items.push({
          e,
          ...(l.kind === "computation" ? { action: { label: "Split into lines I can change", run: () => replace(l.id, computationAsLines()) } } : {}),
          ...(l.kind === "formula" ? { pos: posFor(l.replaces, l.label, l.expr, sample) } : {}),
        });
      }
    }
  } else if (block.type === "field") {
    const e = explainKey(block.key, sample);
    items.push({
      e,
      ...(e.formula && TOTALS_FIELDS[block.key].format === "money" ? { action: { label: "Change how it's computed", run: () => fieldAsFormula(block, e.formula!) } } : {}),
    });
  } else if (block.type === "formula") {
    for (const e of explainPart(block, lineId, sample)) items.push({ e, pos: posFor(block.replaces, block.label, block.expr, sample) });
  } else {
    for (const e of explainPart(block, lineId, sample)) items.push({ e });
  }
  if (items.length === 0) return null;

  return (
    <div className="space-y-2 rounded-xl border-2 border-sky-200 bg-sky-50/50 p-3">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-sky-900">
        <Calculator className="h-3.5 w-3.5" /> How this is computed
        <span className="font-normal text-sky-700">(with the sale in the preview)</span>
      </p>
      {items.map(({ e, action, pos }, i) => (
        <div key={i} className="space-y-1.5 rounded-lg border border-sky-100 bg-white p-2">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-xs font-semibold text-zinc-800">{e.title}</span>
            {e.value !== null && <span className="font-mono text-sm font-bold text-zinc-900">{e.value}</span>}
          </div>
          {e.steps.length > 0 && (
            <ol className="ml-4 list-decimal space-y-0.5 text-[11px] leading-snug text-zinc-700">
              {e.steps.map((s, j) => (
                <li key={j} className={/\d/.test(s) ? "font-mono" : ""}>
                  {s}
                </li>
              ))}
            </ol>
          )}
          {e.formula && (
            <p className="rounded bg-zinc-50 px-1.5 py-1 font-mono text-[10px] text-zinc-600" title="The same computation as a formula">
              ƒx {e.formula}
            </p>
          )}
          <p className="text-[10px] leading-snug text-zinc-500">{e.source}</p>
          {e.note && <p className="text-[10px] leading-snug text-amber-700">{e.note}</p>}
          {action && (
            <button
              type="button"
              onClick={() => onChange(action.run())}
              className="rounded-full border border-sky-300 bg-white px-3 py-1 text-[11px] font-semibold text-sky-800 hover:bg-sky-50"
              title="Turns it into a formula that prints the same figure; then edit the formula below"
            >
              ✏️ {action.label}
            </button>
          )}
          {pos === "follows" && (
            <p className="text-[10px] leading-snug text-zinc-500">At the POS this follows from the items and the total, so there&apos;s nothing separate to apply.</p>
          )}
          {pos && pos !== "follows" && onApplyToPos && (
            <div className="rounded-md bg-amber-50 p-1.5">
              <p className="text-[10px] leading-snug text-amber-900">This only changes the receipt. Want customers to be charged this way too?</p>
              <button
                type="button"
                onClick={() => onApplyToPos(pos)}
                className="mt-1 rounded-full bg-amber-600 px-3 py-1 text-[11px] font-semibold text-white hover:bg-amber-500"
              >
                Apply to the POS too…
              </button>
            </div>
          )}
        </div>
      ))}
      <p className="text-[10px] leading-snug text-zinc-500">
        Changing a computation here changes only what the receipt prints. What customers pay is set under Receipt settings › What the POS charges.
      </p>
    </div>
  );
}

// Wizard: every amount the totals will print, each with how it's computed and
// a formula box to change it (empty = the standard computation).
export function AmountChecks({
  lines,
  sample,
  formulas,
  onFormulas,
}: {
  lines: TotalsLine[]; // the totals lines as the standard computation builds them
  sample: ReceiptData | null;
  formulas: Partial<Record<TotalsKey, string>>;
  onFormulas: (f: Partial<Record<TotalsKey, string>>) => void;
}) {
  if (!sample) return <p className="text-xs text-zinc-400">Loading the sample sale…</p>;
  const rows = lines.filter((l) => l.kind === "computation" || (l.kind === "value" && TOTALS_FIELDS[l.key].format === "money"));
  return (
    <div className="space-y-1.5">
      {rows.map((l) => {
        if (l.kind === "computation") {
          const e = explainComputation(sample);
          return (
            <details key={l.id} className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5">
              <summary className="cursor-pointer text-xs font-semibold text-zinc-800">Step-by-step computation (tap to see each step)</summary>
              <ol className="ml-4 mt-1 list-decimal space-y-0.5 font-mono text-[11px] text-zinc-700">
                {e.steps.map((s, j) => <li key={j}>{s}</li>)}
              </ol>
            </details>
          );
        }
        if (l.kind !== "value") return null;
        const e = explainKey(l.key, sample);
        const own = formulas[l.key];
        const expr = own ?? e.formula ?? "";
        const err = own ? formulaError(own) : null;
        const v = own && !err ? computeFormula(own, sample) : null;
        const shown = own ? (err ? "?" : v === null ? "—" : v.toFixed(2)) : e.value;
        return (
          <details key={l.id} className={`rounded-lg border bg-white px-2.5 py-1.5 ${own ? "border-amber-300" : "border-zinc-200"}`}>
            <summary className="flex cursor-pointer items-baseline justify-between gap-2 text-xs">
              <span className="font-semibold text-zinc-800">
                {l.label.replace(/\{[^}]+\}/g, "").replace(/:\s*$/, "").trim() || e.title}
                {own && <span className="ml-1 font-normal text-amber-700">(your computation)</span>}
              </span>
              <span className="font-mono font-bold text-zinc-900">{shown}</span>
            </summary>
            <ol className="ml-4 mt-1 list-decimal space-y-0.5 text-[11px] leading-snug text-zinc-700">
              {e.steps.map((s, j) => (
                <li key={j} className={/\d/.test(s) ? "font-mono" : ""}>
                  {s}
                </li>
              ))}
            </ol>
            {e.formula && (
              <label className="mt-1.5 block">
                <span className="text-[10px] font-medium text-zinc-500">Computation (change it if it&apos;s not how you want it)</span>
                <input
                  className={`mt-0.5 h-8 w-full rounded-md border px-2 font-mono text-[11px] ${err ? "border-red-400" : "border-zinc-200"}`}
                  value={expr}
                  onChange={(ev) => {
                    const next = { ...formulas };
                    if (ev.target.value.trim() === "" || ev.target.value === e.formula) delete next[l.key];
                    else next[l.key] = ev.target.value;
                    onFormulas(next);
                  }}
                />
                {err && <span className="text-[10px] text-red-600">{err}</span>}
                {own && !err && (
                  <span className="text-[10px] text-zinc-600">
                    = {withNumbers(own, sample)} = <strong>{v === null ? "no answer for this sale" : v.toFixed(2)}</strong>{" "}
                    <button type="button" className="ml-1 font-semibold text-emerald-700" onClick={() => {
                      const next = { ...formulas };
                      delete next[l.key];
                      onFormulas(next);
                    }}>
                      Back to standard
                    </button>
                  </span>
                )}
              </label>
            )}
          </details>
        );
      })}
      <p className="text-[10px] leading-snug text-zinc-500">These change only what the receipt prints. What customers pay stays the standard computation (or your POS settings).</p>
    </div>
  );
}

