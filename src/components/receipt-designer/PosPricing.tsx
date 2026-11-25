"use client";

import { useState } from "react";
import useSWR from "swr";
import { History, Lock, Loader2, Undo2 } from "lucide-react";
import type { DiscountDTO } from "@/lib/discounts";
import { discountRateText } from "@/lib/discount-math";
import { ANY_SALE, describeWhen, RULE_MAX_CHANGE, ROUNDING_STEPS, ruleError, type PricingRules, type RuleWhen } from "@/lib/pricing";
import { exampleCheckouts } from "@/lib/receipt-designer/samples";
import ConfirmDialog from "./ConfirmDialog";

interface PricingState {
  roundingStep: number | null;
  ruleEnabled: boolean;
  ruleLabel: string;
  ruleExpr: string;
  ruleWhen?: RuleWhen;
}
interface HistoryRow {
  id: string;
  kind: string;
  summary: string;
  createdAt: string;
  undoneAt: string | null;
}
interface PosState {
  pricing: PricingState;
  discounts: DiscountDTO[];
  history: HistoryRow[];
}

const peso = (n: number) => `₱${n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const rulesOf = (p: PricingState): PricingRules => ({
  roundingStep: p.roundingStep,
  rule: p.ruleEnabled && p.ruleExpr.trim() && !ruleError(p.ruleExpr) ? { label: p.ruleLabel, expr: p.ruleExpr, when: p.ruleWhen ?? ANY_SALE } : null,
});

// The "Only on…" inputs as typed (amounts stay text while typing).
interface WhenDraft {
  payment: RuleWhen["payment"];
  min: string;
  max: string;
}
const draftOf = (w: RuleWhen | undefined): WhenDraft => ({
  payment: w?.payment ?? "any",
  min: w?.minTotal != null ? String(w.minTotal) : "",
  max: w?.maxTotal != null ? String(w.maxTotal) : "",
});
const amountOf = (s: string) => (s.trim() === "" ? null : Number(s));
const whenOf = (d: WhenDraft): RuleWhen => ({ payment: d.payment, minTotal: amountOf(d.min), maxTotal: amountOf(d.max) });
const whenProblem = (d: WhenDraft) => {
  const w = whenOf(d);
  if ([w.minTotal, w.maxTotal].some((v) => v !== null && (!Number.isFinite(v) || v < 0))) return "Enter a total from ₱0 up.";
  if (w.minTotal !== null && w.maxTotal !== null && w.minTotal > w.maxTotal) return "The lowest total is more than the highest.";
  return null;
};

// Before → after on example checkouts.
export function Examples({ rows }: { rows: { label: string; before: number; after: number; note?: string | null }[] }) {
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-left text-zinc-500">
          <th className="py-1 font-medium">Example</th>
          <th className="py-1 text-right font-medium">Now</th>
          <th className="py-1 text-right font-medium">After</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const diff = Math.round((r.after - r.before) * 100) / 100;
          return (
            <tr key={r.label} className="border-t border-zinc-100 align-top">
              <td className="py-1 pr-2 text-zinc-700">
                {r.label}
                {r.note && <span className="block text-[10px] text-zinc-400">{r.note}</span>}
              </td>
              <td className="whitespace-nowrap py-1 pl-3 text-right font-mono">{peso(r.before)}</td>
              <td className={`whitespace-nowrap py-1 pl-3 text-right font-mono font-semibold ${diff > 0 ? "text-amber-700" : diff < 0 ? "text-emerald-700" : "text-zinc-800"}`}>
                {peso(r.after)}
                {diff !== 0 && <span className="block text-[10px] font-normal">{diff > 0 ? "+" : "−"}{peso(Math.abs(diff))}</span>}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

type Pending =
  | { kind: "rounding"; step: number | null }
  | { kind: "formulaOn"; label: string; expr: string; when: WhenDraft }
  | { kind: "formulaOff" }
  | { kind: "discount"; discount: DiscountDTO; next: { kind: string; value: number; maxAmount: number | null; vatExempt: boolean } }
  | { kind: "undo"; row: HistoryRow };

// "What the POS charges": the parts of the receipt that also change real sales.
export default function PosPricing({
  formulaDraft,
  onFormulaDraftDone,
  onApplied,
}: {
  formulaDraft: { label: string; expr: string } | null; // "Charge customers this amount" from a formula on the receipt
  onFormulaDraftDone: () => void;
  onApplied: () => void; // refresh the preview sale
}) {
  const { data, error: loadError, mutate } = useSWR<PosState>("/api/settings/pos-changes");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [edits, setEdits] = useState<Record<string, { kind: string; value: string; maxAmount: string; vatExempt: boolean }>>({});

  // A formula sent from the receipt opens straight into its confirmation.
  const [draftSeen, setDraftSeen] = useState<typeof formulaDraft>(null);
  if (formulaDraft !== draftSeen) {
    setDraftSeen(formulaDraft);
    if (formulaDraft) setPending({ kind: "formulaOn", label: formulaDraft.label.replace(/:\s*$/, "") || "Adjustment", expr: formulaDraft.expr, when: draftOf(undefined) });
  }
  const close = () => {
    setPending(null);
    if (formulaDraft) onFormulaDraftDone();
  };

  const send = async (body: object) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/settings/pos-changes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Couldn't apply that.");
      await mutate(json, { revalidate: false });
      setEdits({});
      close();
      onApplied();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!data) {
    return (
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-zinc-600">What the POS charges</p>
        <p className="text-[11px] text-zinc-400">{loadError ? "Couldn't load the POS settings." : "Loading…"}</p>
      </div>
    );
  }

  const p = data.pricing;
  const current = rulesOf(p);
  const custom = data.discounts.filter((d) => !d.isSystem);
  const system = data.discounts.filter((d) => d.isSystem);

  // The confirmation for whatever is pending.
  let dialog: React.ReactNode = null;
  if (pending) {
    const common = { busy, onCancel: close, tone: "amber" as const };
    if (pending.kind === "rounding") {
      const next = { ...current, roundingStep: pending.step };
      dialog = (
        <ConfirmDialog {...common} title="Apply cash rounding to your POS?" confirmLabel="Yes, apply to POS" onConfirm={() => send({ action: "pricing", roundingStep: pending.step })}>
          <p>
            {pending.step
              ? `New cash sales will round the amount due DOWN to the nearest ${peso(pending.step)} (never up). GCash, Maya and other e-wallet payments stay exact.`
              : "Cash sales will go back to the exact amount."}
          </p>
          <Examples rows={exampleCheckouts(next).map((e, i) => ({ label: e.label, before: exampleCheckouts(current)[i].charged, after: e.charged }))} />
          <p className="text-xs text-zinc-500">Old sales and their reprints keep their amounts. You can undo this any time.</p>
        </ConfirmDialog>
      );
    } else if (pending.kind === "formulaOn") {
      const problem = ruleError(pending.expr) ?? whenProblem(pending.when);
      const next = { ...current, rule: problem ? null : { label: pending.label || "Adjustment", expr: pending.expr, when: whenOf(pending.when) } };
      const setWhen = (patch: Partial<WhenDraft>) => setPending({ ...pending, when: { ...pending.when, ...patch } });
      dialog = (
        <ConfirmDialog
          {...common}
          title="Charge customers with this formula?"
          confirmLabel="Yes, apply to POS"
          disabled={Boolean(problem)}
          onConfirm={() => send({ action: "pricing", ruleEnabled: true, ruleLabel: pending.label, ruleExpr: pending.expr, ruleWhen: whenOf(pending.when) })}
        >
          <label className="block">
            <span className="text-xs font-medium text-zinc-700">Name on the receipt</span>
            <input
              className="mt-0.5 h-8 w-full rounded-md border border-zinc-200 px-2 text-sm"
              value={pending.label}
              maxLength={40}
              onChange={(e) => setPending({ ...pending, label: e.target.value })}
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-zinc-700">The customer pays</span>
            <input
              className={`mt-0.5 h-8 w-full rounded-md border px-2 font-mono text-sm ${problem ? "border-red-400" : "border-zinc-200"}`}
              value={pending.expr}
              onChange={(e) => setPending({ ...pending, expr: e.target.value })}
            />
          </label>
          <fieldset className="space-y-1 rounded-lg border border-zinc-200 p-2">
            <legend className="px-1 text-xs font-medium text-zinc-700">Only on</legend>
            <select
              aria-label="Payment"
              className="h-8 w-full rounded-md border border-zinc-200 px-2 text-sm"
              value={pending.when.payment}
              onChange={(e) => setWhen({ payment: e.target.value as WhenDraft["payment"] })}
            >
              <option value="any">Every payment method</option>
              <option value="CASH">Cash sales only</option>
              <option value="E_WALLET">E-wallet sales only (GCash, Maya…)</option>
            </select>
            <div className="flex items-center gap-1.5 text-xs text-zinc-600">
              <span>Total from ₱</span>
              <input aria-label="Lowest total" inputMode="decimal" placeholder="any" className="h-8 w-20 rounded-md border border-zinc-200 px-2 text-sm" value={pending.when.min} onChange={(e) => setWhen({ min: e.target.value })} />
              <span>to ₱</span>
              <input aria-label="Highest total" inputMode="decimal" placeholder="any" className="h-8 w-20 rounded-md border border-zinc-200 px-2 text-sm" value={pending.when.max} onChange={(e) => setWhen({ max: e.target.value })} />
            </div>
            <p className="text-[11px] text-zinc-500">The total here is the standard total, before the formula. Other sales are charged the standard amount.</p>
          </fieldset>
          {problem && <p className="text-xs text-red-600">{problem}</p>}
          {!problem && <Examples rows={exampleCheckouts(next).map((e, i) => ({ label: e.label, before: exampleCheckouts(current)[i].charged, after: e.charged, note: e.note }))} />}
          <ul className="ml-4 list-disc space-y-0.5 text-xs text-zinc-600">
            <li>Senior citizen, PWD and other VAT-exempt discounts always use the standard computation, as the law requires.</li>
            <li>If the formula gives no answer, or one more than {RULE_MAX_CHANGE * 100}% away from the standard total, the standard total is charged.</li>
            <li>The difference prints as its own line, and VAT is recomputed so your reports and cash count stay right.</li>
            <li>Old sales keep their amounts. You can undo this any time.</li>
          </ul>
        </ConfirmDialog>
      );
    } else if (pending.kind === "formulaOff") {
      dialog = (
        <ConfirmDialog {...common} title="Stop using the price formula?" confirmLabel="Yes, stop it" onConfirm={() => send({ action: "pricing", ruleEnabled: false })}>
          <p>New sales go back to the standard computation{p.roundingStep ? " (cash rounding stays on)" : ""}.</p>
        </ConfirmDialog>
      );
    } else if (pending.kind === "discount") {
      const before = exampleCheckouts(current, { code: pending.discount.name, kind: pending.discount.kind, value: pending.discount.value, maxAmount: pending.discount.maxAmount, vatExempt: pending.discount.vatExempt })[0];
      const after = exampleCheckouts(current, { code: pending.discount.name, ...pending.next })[0];
      dialog = (
        <ConfirmDialog {...common} title={`Change the "${pending.discount.name}" discount at the POS?`} confirmLabel="Yes, apply to POS" onConfirm={() => send({ action: "discount", id: pending.discount.id, ...pending.next })}>
          <p>
            {discountRateText(pending.discount)}
            {pending.discount.vatExempt ? " (VAT removed first)" : ""} → <strong>{discountRateText(pending.next)}</strong>
            {pending.next.vatExempt ? " (VAT removed first)" : ""}
          </p>
          <Examples rows={[{ label: `${before.label} (${peso(before.gross)} of items)`, before: before.charged, after: after.charged }]} />
          <p className="text-xs text-zinc-500">The checkout uses the new terms from the next sale. Old sales keep theirs. You can undo this any time.</p>
        </ConfirmDialog>
      );
    } else {
      dialog = (
        <ConfirmDialog {...common} tone="emerald" title="Undo this change?" confirmLabel="Yes, undo" onConfirm={() => send({ action: "undo", changeId: pending.row.id })}>
          <p className="rounded-lg bg-zinc-50 p-2 font-mono text-xs">{pending.row.summary}</p>
          <p>The POS goes back to how it was before this change, from the next sale. Sales made in between keep their amounts.</p>
        </ConfirmDialog>
      );
    }
  }

  const input = "h-7 rounded-md border border-zinc-200 bg-white px-1.5 text-xs";
  return (
    <div className="space-y-3 rounded-xl border-2 border-amber-200 bg-amber-50/40 p-3">
      <div>
        <p className="text-xs font-semibold text-amber-900">💰 What the POS charges</p>
        <p className="text-[11px] leading-snug text-amber-800">These change what customers pay on new sales, after you confirm. Everything else here only changes how the receipt looks.</p>
      </div>
      {error && <p className="text-[11px] text-red-600">{error}</p>}

      {/* rounding */}
      <label className="flex items-center justify-between gap-2">
        <span className="text-xs text-zinc-700">Cash rounding (down)</span>
        <select className={input} value={p.roundingStep ?? ""} onChange={(e) => setPending({ kind: "rounding", step: e.target.value ? Number(e.target.value) : null })}>
          <option value="">Off: exact amount</option>
          {ROUNDING_STEPS.map((s) => (
            <option key={s} value={s}>
              To {peso(s)}
            </option>
          ))}
        </select>
      </label>

      {/* formula */}
      <div className="rounded-lg border border-zinc-200 bg-white p-2">
        <p className="text-xs text-zinc-700">Price formula</p>
        {p.ruleEnabled ? (
          <div className="mt-1 space-y-1">
            <p className="font-mono text-[11px] text-zinc-800">
              {p.ruleLabel}: {p.ruleExpr}
            </p>
            <p className="text-[11px] text-zinc-500">Only on: {describeWhen(p.ruleWhen) || "every sale"} (never SC/PWD)</p>
            <div className="flex gap-2">
              <button type="button" className="text-[11px] font-semibold text-emerald-700" onClick={() => setPending({ kind: "formulaOn", label: p.ruleLabel, expr: p.ruleExpr, when: draftOf(p.ruleWhen) })}>
                Change
              </button>
              <button type="button" className="text-[11px] font-semibold text-red-600" onClick={() => setPending({ kind: "formulaOff" })}>
                Turn off
              </button>
            </div>
          </div>
        ) : (
          <p className="mt-0.5 text-[11px] text-zinc-500">
            Off. To use one, select a Formula on the receipt and press <strong>&quot;Charge customers this amount&quot;</strong>, or{" "}
            <button type="button" className="font-semibold text-emerald-700" onClick={() => setPending({ kind: "formulaOn", label: "Service fee", expr: "total * 1.02", when: draftOf(undefined) })}>
              start one here
            </button>
            .
          </p>
        )}
      </div>

      {/* discounts */}
      <div className="space-y-1.5">
        <p className="text-xs text-zinc-700">Discounts at checkout</p>
        {system.map((d) => (
          <div key={d.id} className="flex items-center gap-1.5 text-[11px] text-zinc-500">
            <Lock className="h-3 w-3" /> {d.name}: 20%, VAT removed first <span className="text-zinc-400">(set by law)</span>
          </div>
        ))}
        {custom.length === 0 && <p className="text-[11px] text-zinc-400">No discounts of your own yet. Add them in Settings › Discounts.</p>}
        {custom.map((d) => {
          const e = edits[d.id] ?? { kind: d.kind, value: String(d.value), maxAmount: d.maxAmount != null ? String(d.maxAmount) : "", vatExempt: d.vatExempt };
          const set = (patch: Partial<typeof e>) => setEdits({ ...edits, [d.id]: { ...e, ...patch } });
          const next = { kind: e.kind, value: Number(e.value), maxAmount: e.kind === "PERCENT" && e.maxAmount ? Number(e.maxAmount) : null, vatExempt: e.vatExempt };
          const changed = next.kind !== d.kind || next.value !== d.value || next.maxAmount !== d.maxAmount || next.vatExempt !== d.vatExempt;
          const valid = Number.isFinite(next.value) && next.value > 0 && (next.kind === "FIXED" || next.value <= 100);
          return (
            <div key={d.id} className={`space-y-1 rounded-lg border bg-white p-2 ${d.isActive ? "border-zinc-200" : "border-dashed border-zinc-200 opacity-60"}`}>
              <p className="text-[11px] font-semibold text-zinc-800">
                {d.name}
                {!d.isActive && <span className="ml-1 font-normal text-zinc-400">(off)</span>}
              </p>
              <div className="flex flex-wrap items-center gap-1">
                <input className={`${input} w-16`} inputMode="decimal" value={e.value} onChange={(ev) => set({ value: ev.target.value })} />
                <select className={input} value={e.kind} onChange={(ev) => set({ kind: ev.target.value })}>
                  <option value="PERCENT">% off</option>
                  <option value="FIXED">₱ off</option>
                </select>
                {e.kind === "PERCENT" && (
                  <input className={`${input} w-20`} inputMode="decimal" placeholder="max ₱ (any)" value={e.maxAmount} onChange={(ev) => set({ maxAmount: ev.target.value })} />
                )}
              </div>
              <label className="flex items-center gap-1.5 text-[11px] text-zinc-600">
                <input type="checkbox" className="h-3.5 w-3.5 accent-emerald-600" checked={e.vatExempt} onChange={(ev) => set({ vatExempt: ev.target.checked })} />
                Remove VAT first (VAT-exempt, like SC/PWD)
              </label>
              {changed && (
                <button
                  type="button"
                  disabled={!valid}
                  onClick={() => setPending({ kind: "discount", discount: d, next })}
                  className="rounded-full bg-amber-600 px-3 py-1 text-[11px] font-semibold text-white hover:bg-amber-500 disabled:opacity-50"
                >
                  Apply to POS…
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* history */}
      <details className="rounded-lg border border-zinc-200 bg-white p-2" open={data.history.some((h) => !h.undoneAt)}>
        <summary className="flex cursor-pointer items-center gap-1 text-xs text-zinc-700">
          <History className="h-3.5 w-3.5" /> Changes to the POS ({data.history.length})
        </summary>
        {data.history.length === 0 ? (
          <p className="mt-1 text-[11px] text-zinc-400">Nothing yet. Every change you apply shows here, ready to undo.</p>
        ) : (
          <ul className="mt-1.5 space-y-1">
            {data.history.map((h) => (
              <li key={h.id} className={`flex items-start gap-2 rounded-md border border-zinc-100 p-1.5 ${h.undoneAt ? "opacity-50" : ""}`}>
                <span className="min-w-0 flex-1">
                  <span className={`block text-[11px] text-zinc-800 ${h.undoneAt ? "line-through" : ""}`}>{h.summary}</span>
                  <span className="block text-[10px] text-zinc-400">
                    {new Date(h.createdAt).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" })}
                    {h.undoneAt && " · undone"}
                  </span>
                </span>
                {!h.undoneAt && (
                  <button
                    type="button"
                    onClick={() => setPending({ kind: "undo", row: h })}
                    className="inline-flex shrink-0 items-center gap-0.5 rounded-full border border-zinc-200 px-2 py-0.5 text-[11px] font-semibold text-zinc-700 hover:bg-zinc-50"
                  >
                    <Undo2 className="h-3 w-3" /> Undo
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </details>
      {busy && !pending && <Loader2 className="h-4 w-4 animate-spin text-amber-700" />}
      {dialog}
    </div>
  );
}
