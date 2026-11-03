"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

export type SortValue = string | number | boolean | Date | null | undefined;
export type SortDir = "asc" | "desc";

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

function compare(a: SortValue, b: SortValue): number {
  // Blanks always go last, whichever way the column is sorted.
  const aBlank = a === null || a === undefined || a === "";
  const bBlank = b === null || b === undefined || b === "";
  if (aBlank || bBlank) return aBlank === bBlank ? 0 : aBlank ? 1 : -1;
  if (a instanceof Date || b instanceof Date) return new Date(a as Date).getTime() - new Date(b as Date).getTime();
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "boolean" && typeof b === "boolean") return Number(a) - Number(b);
  return collator.compare(String(a), String(b));
}

// The sort a header row is showing: ascending, then descending, then back to
// the default order. Lists sorted by the server use this directly and send
// the key and direction with the request.
export function useSortState<K extends string>() {
  const [sort, setSort] = useState<{ key: K; dir: SortDir } | null>(null);
  const toggle = (key: K) =>
    setSort((prev) => (prev?.key !== key ? { key, dir: "asc" } : prev.dir === "asc" ? { key, dir: "desc" } : null));
  return { sort, toggle };
}

// Click-to-sort for a table whose rows are already loaded. Each column is a
// key plus how to read its value from a row. Clicking a header sorts
// ascending, then descending, then back to the order the rows came in.
export function useTableSort<T, K extends string>(rows: T[], columns: Record<K, (row: T) => SortValue>) {
  const { sort, toggle } = useSortState<K>();

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const get = columns[sort.key];
    const sign = sort.dir === "asc" ? 1 : -1;
    const blank = (v: SortValue) => v === null || v === undefined || v === "";
    return rows
      .map((row, i) => ({ row, i, v: get(row) }))
      .sort((x, y) => {
        if (blank(x.v) || blank(y.v)) return compare(x.v, y.v) || x.i - y.i;
        return sign * compare(x.v, y.v) || x.i - y.i;
      })
      .map((x) => x.row);
    // columns is a fresh object literal each render; the key is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, sort]);

  return { sorted, sort, toggle };
}

// "1–50 of 5,682" with previous / next, for lists the server sends a page at a time.
export function Pager({ offset, limit, total, onChange }: { offset: number; limit: number; total: number; onChange: (offset: number) => void }) {
  if (total <= limit && offset === 0) return null;
  const last = Math.min(offset + limit, total);
  // The buttons sit under the list; go back up so the new page starts in view.
  const go = (e: React.MouseEvent<HTMLButtonElement>, next: number) => {
    onChange(next);
    let el: HTMLElement | null = e.currentTarget.parentElement;
    while (el && !(el.scrollHeight > el.clientHeight && /(auto|scroll)/.test(getComputedStyle(el).overflowY))) el = el.parentElement;
    (el ?? window).scrollTo({ top: 0, behavior: "smooth" });
  };
  const btn = "rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:border-zinc-300 disabled:opacity-40";
  return (
    <div className="mt-3 flex items-center justify-between gap-3 text-xs text-zinc-500">
      <span className="tabular-nums">
        {total === 0 ? 0 : (offset + 1).toLocaleString("en-PH")}–{last.toLocaleString("en-PH")} of {total.toLocaleString("en-PH")}
      </span>
      <span className="flex gap-1.5">
        <button type="button" className={btn} disabled={offset === 0} onClick={(e) => go(e, Math.max(0, offset - limit))}>
          Previous
        </button>
        <button type="button" className={btn} disabled={last >= total} onClick={(e) => go(e, offset + limit)}>
          Next
        </button>
      </span>
    </div>
  );
}

// A table header cell that sorts its column. Keeps the table's own header
// styling (className) and adds the arrow; right-aligned columns put it first.
export function SortableTh<K extends string>({
  label,
  sortKey,
  sort,
  onSort,
  className = "px-4 py-3",
  align = "left",
}: {
  label: React.ReactNode;
  sortKey: K;
  sort: { key: K; dir: SortDir } | null;
  onSort: (key: K) => void;
  className?: string;
  align?: "left" | "right";
}) {
  const active = sort?.key === sortKey;
  const Icon = !active ? ArrowUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th className={className} aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`group inline-flex items-center gap-1 [text-transform:inherit] hover:text-zinc-700 ${align === "right" ? "flex-row-reverse" : ""} ${
          active ? "text-zinc-700" : ""
        }`}
      >
        {label}
        {/* Faint until hovered, so touch screens can still tell the column sorts. */}
        <Icon className={`h-3 w-3 shrink-0 ${active ? "text-emerald-600" : "opacity-30 transition-opacity group-hover:opacity-70"}`} aria-hidden />
      </button>
    </th>
  );
}
