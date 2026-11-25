"use client";

import { useState } from "react";
import { Check, Lock, Plus } from "lucide-react";
import type { CheckItem } from "@/lib/receipt-designer/validate";

// "Is my receipt complete?" — progress plus a one-click fix for each missing item.
export default function Checklist({ items, onFix }: { items: CheckItem[]; onFix: (tileId: string) => void }) {
  const [open, setOpen] = useState(false);
  const done = items.filter((i) => i.done).length;
  const complete = done === items.length;
  const pct = done / items.length;
  const r = 9;
  const circ = 2 * Math.PI * r;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition ${
          complete ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100"
        }`}
        title="What every receipt should have"
      >
        <svg width="22" height="22" viewBox="0 0 22 22" className="-ml-1">
          <circle cx="11" cy="11" r={r} fill="none" stroke="currentColor" strokeOpacity=".2" strokeWidth="3" />
          <circle
            cx="11"
            cy="11"
            r={r}
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={circ * (1 - pct)}
            transform="rotate(-90 11 11)"
            style={{ transition: "stroke-dashoffset .4s ease" }}
          />
        </svg>
        {complete ? "Receipt complete 🎉" : `Checklist ${done}/${items.length}`}
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-2 w-80 rounded-xl border border-zinc-200 bg-white p-3 shadow-xl">
          <p className="text-sm font-semibold text-zinc-900">{complete ? "Everything a receipt needs is there." : "Make your receipt complete"}</p>
          <p className="mb-2 text-[11px] text-zinc-500">You decide — these never stop you from saving.</p>
          <ul className="space-y-1.5">
            {items.map((i) => (
              <li key={i.key} className={`flex items-start gap-2 rounded-lg p-1.5 ${i.done ? "" : "bg-amber-50"}`}>
                <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${i.done ? "bg-emerald-500 text-white" : "border-2 border-amber-400"}`}>
                  {i.locked ? <Lock className="h-3 w-3" /> : i.done ? <Check className="h-3.5 w-3.5" /> : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block text-xs font-medium ${i.done ? "text-zinc-500" : "text-zinc-900"}`}>{i.label}</span>
                  {!i.done && <span className="block text-[11px] text-amber-800">{i.warning}</span>}
                  {i.locked && <span className="block text-[11px] text-zinc-400">Always printed. It can&apos;t be removed.</span>}
                </span>
                {!i.done && i.fix && (
                  <button
                    type="button"
                    onClick={() => onFix(i.fix!)}
                    className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-emerald-600 px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-emerald-500"
                  >
                    <Plus className="h-3 w-3" /> Add
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
