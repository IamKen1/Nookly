"use client";

import type { Condition, SaleType } from "@/lib/receipt-designer/types";

const SALE_TYPES: { key: SaleType; label: string }[] = [
  { key: "scpwd", label: "Senior / PWD sale" },
  { key: "discount", label: "Any discount" },
  { key: "noDiscount", label: "No discount" },
  { key: "cash", label: "Paid in cash" },
  { key: "ewallet", label: "Paid by e-wallet" },
  { key: "customer", label: "Has a customer" },
  { key: "points", label: "Has loyalty points" },
  { key: "prescription", label: "Has a prescription" },
  { key: "sale", label: "A sale (not a return or void)" },
  { key: "return", label: "A return / refund" },
  { key: "voided", label: "A voided sale" },
];

const input = "h-8 w-full rounded-md border border-zinc-200 bg-white px-2 text-sm text-zinc-900 outline-none focus:border-emerald-500";

export const conditionSummary = (c?: Condition) => {
  if (!c) return "";
  const parts: string[] = [];
  if (c.saleTypes?.length) parts.push(c.saleTypes.map((t) => SALE_TYPES.find((s) => s.key === t)?.label.toLowerCase()).join(" + "));
  if (c.minTotal != null) parts.push(`total ≥ ₱${c.minTotal}`);
  if (c.maxTotal != null) parts.push(`total ≤ ₱${c.maxTotal}`);
  if (c.fromDate || c.toDate) parts.push(`${c.fromDate ?? "…"} to ${c.toDate ?? "…"}`);
  if (c.branches?.length) parts.push(`${c.branches.length} branch${c.branches.length === 1 ? "" : "es"}`);
  return parts.join(", ");
};

// "Show only when…": every condition that's set must hold for the sale.
export default function ConditionEditor({
  value,
  onChange,
  branches,
}: {
  value?: Condition;
  onChange: (c: Condition | undefined) => void;
  branches: { id: string; name: string }[];
}) {
  const c = value ?? {};
  const set = (patch: Partial<Condition>) => {
    const next: Condition = { ...c, ...patch };
    const empty =
      !next.saleTypes?.length && next.minTotal == null && next.maxTotal == null && !next.fromDate && !next.toDate && !next.branches?.length;
    onChange(empty ? undefined : next);
  };
  const toggle = <T extends string>(list: T[] | undefined, item: T, on: boolean) => (on ? [...(list ?? []), item] : (list ?? []).filter((x) => x !== item));
  const money = (v: string) => (v.trim() === "" ? null : Math.max(0, Number(v) || 0));

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-zinc-500">Leave everything empty to always print. When several are set, all must be true.</p>
      <div className="grid grid-cols-1 gap-1">
        {SALE_TYPES.map((t) => (
          <label key={t.key} className="flex items-center gap-2 text-sm text-zinc-700">
            <input
              type="checkbox"
              checked={Boolean(c.saleTypes?.includes(t.key))}
              onChange={(e) => set({ saleTypes: toggle(c.saleTypes, t.key, e.target.checked) })}
              className="h-4 w-4 accent-emerald-600"
            />
            {t.label}
          </label>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="block space-y-1">
          <span className="text-xs font-medium text-zinc-600">Total at least (₱)</span>
          <input className={input} inputMode="decimal" value={c.minTotal ?? ""} onChange={(e) => set({ minTotal: money(e.target.value) })} />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-zinc-600">Total at most (₱)</span>
          <input className={input} inputMode="decimal" value={c.maxTotal ?? ""} onChange={(e) => set({ maxTotal: money(e.target.value) })} />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-zinc-600">From date</span>
          <input type="date" className={input} value={c.fromDate ?? ""} onChange={(e) => set({ fromDate: e.target.value || null })} />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-zinc-600">Until date</span>
          <input type="date" className={input} value={c.toDate ?? ""} onChange={(e) => set({ toDate: e.target.value || null })} />
        </label>
      </div>
      {branches.length > 1 && (
        <div>
          <p className="mb-1 text-xs font-medium text-zinc-600">Only at these branches</p>
          {branches.map((b) => (
            <label key={b.id} className="flex items-center gap-2 text-sm text-zinc-700">
              <input
                type="checkbox"
                checked={Boolean(c.branches?.includes(b.id))}
                onChange={(e) => set({ branches: toggle(c.branches, b.id, e.target.checked) })}
                className="h-4 w-4 accent-emerald-600"
              />
              {b.name}
            </label>
          ))}
          <p className="mt-1 text-[11px] text-zinc-400">None ticked = every branch.</p>
        </div>
      )}
      {value && (
        <button type="button" onClick={() => onChange(undefined)} className="text-xs font-medium text-zinc-500 hover:text-red-600">
          Clear conditions (always print)
        </button>
      )}
    </div>
  );
}
