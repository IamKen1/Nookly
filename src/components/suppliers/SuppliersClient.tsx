"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { ChevronRight, Plus, Search } from "lucide-react";
import { formatDate, peso } from "@/lib/format";
import SupplierForm, { termsLabel } from "./SupplierForm";

interface Balance {
  purchases: number;
  open: number;
  overdue: number;
  dueThisWeek: number;
  credit: number;
  balance: number;
  aging: Record<string, number>;
}

interface SupplierRow {
  id: string;
  name: string;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  paymentTermsDays: number;
  isActive: boolean;
  lastDelivery: string | null;
  balance?: Balance | null;
}

const AGING = [
  { key: "current", label: "Not yet due", color: "bg-emerald-500" },
  { key: "d1_30", label: "1–30 days late", color: "bg-amber-400" },
  { key: "d31_60", label: "31–60", color: "bg-orange-500" },
  { key: "d61_90", label: "61–90", color: "bg-red-500" },
  { key: "d90", label: "Over 90", color: "bg-red-800" },
];

export default function SuppliersClient() {
  const { data, isLoading, mutate } = useSWR<{ canPay: boolean; suppliers: SupplierRow[] }>("/api/suppliers?details=1");
  const [q, setQ] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [adding, setAdding] = useState(false);
  const canPay = data?.canPay ?? false;
  const all = data?.suppliers ?? [];
  const list = all.filter((s) => (showInactive || s.isActive) && (!q.trim() || s.name.toLowerCase().includes(q.trim().toLowerCase())));

  const totals = all.reduce(
    (t, s) => {
      const b = s.balance;
      if (!b) return t;
      t.balance += Math.max(0, b.balance);
      t.overdue += b.overdue;
      t.dueThisWeek += b.dueThisWeek;
      t.credit += b.credit;
      for (const a of AGING) t.aging[a.key] = (t.aging[a.key] ?? 0) + (b.aging[a.key] ?? 0);
      return t;
    },
    { balance: 0, overdue: 0, dueThisWeek: 0, credit: 0, aging: {} as Record<string, number> }
  );
  const agingTotal = AGING.reduce((s, a) => s + (totals.aging[a.key] ?? 0), 0);

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Suppliers</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {canPay ? "Who you buy from, what you owe them, and what's due." : "Who you buy from, their deliveries, and returns."}
          </p>
        </div>
        <button onClick={() => setAdding(true)} className="flex items-center gap-2 rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500">
          <Plus className="h-4 w-4" /> Add supplier
        </button>
      </div>

      {canPay && (
        <div className="mt-6 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Tile label="Total payable" value={peso(totals.balance)} hint="Open deliveries less credit" />
            <Tile label="Overdue" value={peso(totals.overdue)} tone={totals.overdue > 0 ? "critical" : "default"} hint="Past the due date" />
            <Tile label="Due in the next 7 days" value={peso(totals.dueThisWeek)} tone={totals.dueThisWeek > 0 ? "warning" : "default"} />
            <Tile label="Credit with suppliers" value={peso(totals.credit)} hint="Advances and return credits not yet used" />
          </div>
          {agingTotal > 0 && (
            <div className="rounded-2xl border border-zinc-200 bg-white p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">Aging of unpaid deliveries</p>
              <div className="flex h-2.5 overflow-hidden rounded-full bg-zinc-100">
                {AGING.map((a) => {
                  const v = totals.aging[a.key] ?? 0;
                  return v > 0 ? <span key={a.key} className={`${a.color} border-r-2 border-white last:border-0`} style={{ width: `${(v / agingTotal) * 100}%` }} title={`${a.label}: ${peso(v)}`} /> : null;
                })}
              </div>
              <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-xs">
                {AGING.map((a) => (
                  <li key={a.key} className="flex items-center gap-1.5 text-zinc-600">
                    <span className={`h-2 w-2 rounded-full ${a.color}`} />
                    {a.label}
                    <span className="font-semibold tabular-nums text-zinc-900">{peso(totals.aging[a.key] ?? 0)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <label className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 sm:max-w-sm">
          <Search className="h-4 w-4 text-zinc-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search suppliers" className="w-full text-sm outline-none" />
        </label>
        <label className="flex items-center gap-2 text-sm text-zinc-600">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} className="h-4 w-4 accent-emerald-600" />
          Show inactive
        </label>
      </div>

      <div className="mt-3 overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-zinc-100 text-left text-xs font-medium uppercase text-zinc-400">
              <th className="px-4 py-3">Supplier</th>
              <th className="px-4 py-3">Phone</th>
              <th className="px-4 py-3">Terms</th>
              <th className="px-4 py-3">Last delivery</th>
              {canPay && <th className="px-4 py-3 text-right">Balance</th>}
              {canPay && <th className="px-4 py-3 text-right">Overdue</th>}
              <th className="w-8 px-2 py-3" />
            </tr>
          </thead>
          <tbody>
            {isLoading && !data ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-zinc-400">
                  Loading...
                </td>
              </tr>
            ) : list.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-zinc-400">
                  {all.length === 0 ? "No suppliers yet. Add one, or pick one when receiving a delivery." : "No suppliers match."}
                </td>
              </tr>
            ) : (
              list.map((s) => (
                <tr key={s.id} className="border-b border-zinc-50 last:border-0 hover:bg-zinc-50">
                  <td className="px-4 py-3">
                    <Link href={`/suppliers/${s.id}`} className="font-medium text-zinc-900 hover:text-emerald-700">
                      {s.name}
                    </Link>
                    {!s.isActive && <span className="ml-2 rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-500">Inactive</span>}
                    {s.contactPerson && <span className="block text-xs text-zinc-400">{s.contactPerson}</span>}
                  </td>
                  <td className="px-4 py-3 text-zinc-600">{s.phone ?? <span className="text-zinc-300">—</span>}</td>
                  <td className="px-4 py-3 text-zinc-600">{termsLabel(s.paymentTermsDays)}</td>
                  <td className="px-4 py-3 text-zinc-600">{s.lastDelivery ? formatDate(s.lastDelivery) : <span className="text-zinc-300">—</span>}</td>
                  {canPay && (
                    <td className="px-4 py-3 text-right tabular-nums">
                      {s.balance && s.balance.balance !== 0 ? (
                        <span className={s.balance.balance > 0 ? "font-semibold text-zinc-900" : "text-emerald-700"}>
                          {s.balance.balance > 0 ? peso(s.balance.balance) : `${peso(-s.balance.balance)} credit`}
                        </span>
                      ) : (
                        <span className="text-zinc-400">Paid up</span>
                      )}
                    </td>
                  )}
                  {canPay && (
                    <td className="px-4 py-3 text-right tabular-nums">
                      {s.balance && s.balance.overdue > 0 ? <span className="font-semibold text-red-600">{peso(s.balance.overdue)}</span> : <span className="text-zinc-300">—</span>}
                    </td>
                  )}
                  <td className="px-2 py-3">
                    <Link href={`/suppliers/${s.id}`} aria-label={`Open ${s.name}`}>
                      <ChevronRight className="h-4 w-4 text-zinc-400" />
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {adding && (
        <SupplierForm
          onClose={() => setAdding(false)}
          onSaved={async () => {
            setAdding(false);
            await mutate();
          }}
        />
      )}
    </div>
  );
}

function Tile({ label, value, hint, tone = "default" }: { label: string; value: string; hint?: string; tone?: "default" | "warning" | "critical" }) {
  const color = tone === "critical" ? "text-red-600" : tone === "warning" ? "text-amber-700" : "text-zinc-900";
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium text-zinc-500">{label}</p>
      <p className={`mt-0.5 text-xl font-semibold tabular-nums ${color}`}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-zinc-400">{hint}</p>}
    </div>
  );
}
