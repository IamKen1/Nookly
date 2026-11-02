"use client";

import { useEffect } from "react";
import useSWR from "swr";

interface Drawer {
  id: string;
  cashier: string;
  openedAt: string;
  mine: boolean;
}

// For cash payments to suppliers: did the money come out of a cash drawer
// (lowers that shift's expected cash) or from outside it (owner, bank)? With
// more than one drawer open at the branch, it asks which one.
export default function PaidFrom({
  fromDrawer,
  onChange,
  shiftId,
  onShiftChange,
}: {
  fromDrawer: boolean;
  onChange: (fromDrawer: boolean) => void;
  shiftId: string | null;
  onShiftChange: (shiftId: string | null) => void;
}) {
  const { data: drawers = [], isLoading } = useSWR<Drawer[]>("/api/shifts/open-drawers");
  // Default to the user's own drawer (listed first), or the only one open.
  useEffect(() => {
    if (fromDrawer && !shiftId && drawers.length > 0) onShiftChange(drawers[0].id);
  }, [fromDrawer, shiftId, drawers, onShiftChange]);

  const time = (iso: string) => new Date(iso).toLocaleString("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm">
      <span className="text-xs font-medium text-zinc-600">Cash taken from</span>
      <label className="flex items-center gap-1.5 text-zinc-700">
        <input type="radio" checked={fromDrawer} onChange={() => onChange(true)} className="h-4 w-4 accent-emerald-600" />
        Cash drawer
      </label>
      <label className="flex items-center gap-1.5 text-zinc-700">
        <input type="radio" checked={!fromDrawer} onChange={() => onChange(false)} className="h-4 w-4 accent-emerald-600" />
        Outside the drawer
      </label>
      {fromDrawer && drawers.length > 1 && (
        <select
          value={shiftId ?? ""}
          onChange={(e) => onShiftChange(e.target.value || null)}
          className="rounded-lg border border-zinc-300 bg-white px-2 py-1 text-sm"
          aria-label="Which drawer"
        >
          {drawers.map((d) => (
            <option key={d.id} value={d.id}>
              {d.mine ? "My drawer" : `${d.cashier}'s drawer`} · since {time(d.openedAt)}
            </option>
          ))}
        </select>
      )}
      <span className={`w-full text-[11px] ${fromDrawer && !isLoading && drawers.length === 0 ? "font-medium text-red-600" : "text-zinc-400"}`}>
        {!fromDrawer
          ? "Owner's money or the bank — no drawer is affected."
          : !isLoading && drawers.length === 0
          ? "No shift is open at this branch — start one first, or choose Outside the drawer."
          : drawers.length === 1
          ? `Comes off ${drawers[0].mine ? "your" : `${drawers[0].cashier}'s`} drawer's expected cash.`
          : "Comes off the chosen drawer's expected cash."}
      </span>
    </div>
  );
}
