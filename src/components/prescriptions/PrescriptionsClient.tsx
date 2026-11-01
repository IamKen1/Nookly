"use client";

import { useState } from "react";
import useSWR from "swr";
import { Download, RotateCcw, Search, X } from "lucide-react";
import { formatDate } from "@/lib/format";
import { useDebouncedValue } from "@/lib/useDebouncedValue";

interface Prescription {
  id: string;
  prescriptionNumber: string;
  status: string;
  originalDate: string;
  instructions: string | null;
  customer: { firstName: string; lastName: string };
  doctor: { firstName: string; lastName: string };
  items: Array<{ id: string; quantity: number; servedQuantity: number; product: { name: string } }>;
}

// Same wording as the Excel export (src/lib/prescription-list.ts).
const STATUS: Record<string, { label: string; tone: string }> = {
  FILLED: { label: "Fully served", tone: "bg-emerald-100 text-emerald-700" },
  PARTIAL: { label: "Partially served", tone: "bg-amber-100 text-amber-800" },
  PENDING: { label: "Not yet served", tone: "bg-zinc-100 text-zinc-600" },
  CANCELLED: { label: "Cancelled", tone: "bg-zinc-100 text-zinc-500" },
  EXPIRED: { label: "Expired", tone: "bg-red-100 text-red-700" },
};

export default function PrescriptionsClient({ canReorder }: { canReorder: boolean }) {
  const [q, setQ] = useState("");
  const query = useDebouncedValue(q.trim(), 300);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [status, setStatus] = useState("");

  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  if (status) params.set("status", status);
  const qs = params.toString();
  const { data: prescriptions = [], isLoading } = useSWR<Prescription[]>(`/api/prescriptions${qs ? `?${qs}` : ""}`, { keepPreviousData: true });
  const filtered = Boolean(query || from || to || status);

  const input = "rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none";

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Prescriptions</h1>
          <p className="mt-1 text-sm text-zinc-500">Prescriptions recorded at checkout. Reorder puts a prescription&apos;s items in the POS cart.</p>
        </div>
        <a
          href={`/api/prescriptions/export${qs ? `?${qs}` : ""}`}
          className="flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 shadow-sm hover:border-zinc-300"
        >
          <Download className="h-4 w-4" /> Export to Excel
        </a>
      </div>

      <div className="mt-5 flex flex-wrap items-end gap-2">
        <label className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 sm:min-w-64">
          <Search className="h-4 w-4 shrink-0 text-zinc-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Customer name or Rx #" className="w-full text-sm outline-none" />
        </label>
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-500">From</label>
          <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className={input} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-500">To</label>
          <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className={input} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-500">Status</label>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={input}>
            <option value="">All</option>
            <option value="PARTIAL">Partially served</option>
            <option value="FILLED">Fully served</option>
          </select>
        </div>
        {filtered && (
          <button
            onClick={() => {
              setQ("");
              setFrom("");
              setTo("");
              setStatus("");
            }}
            className="flex items-center gap-1 rounded-lg px-2 py-2 text-sm font-medium text-zinc-500 hover:text-zinc-800"
          >
            <X className="h-4 w-4" /> Clear
          </button>
        )}
      </div>

      <div className="mt-4 overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
        <table className="w-full min-w-[820px] text-sm">
          <thead>
            <tr className="border-b border-zinc-100 text-left text-xs font-medium uppercase text-zinc-400">
              <th className="px-4 py-3">Rx #</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Doctor</th>
              <th className="px-4 py-3">Items</th>
              <th className="px-4 py-3">Status</th>
              {canReorder && <th className="px-4 py-3" />}
            </tr>
          </thead>
          <tbody>
            {isLoading && prescriptions.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-zinc-400">
                  Loading...
                </td>
              </tr>
            ) : prescriptions.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-zinc-400">
                  {filtered ? "No prescriptions match these filters." : "No prescriptions yet. They show up here once one is recorded at checkout."}
                </td>
              </tr>
            ) : (
              prescriptions.map((p) => {
                const st = STATUS[p.status] ?? { label: p.status, tone: "bg-zinc-100 text-zinc-600" };
                return (
                  <tr key={p.id} className="border-b border-zinc-50 align-top last:border-0">
                    <td className="px-4 py-3 font-medium text-zinc-900">{p.prescriptionNumber}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-zinc-600">{formatDate(p.originalDate)}</td>
                    <td className="px-4 py-3 text-zinc-800">
                      {p.customer.firstName} {p.customer.lastName}
                    </td>
                    <td className="px-4 py-3 text-zinc-600">
                      Dr. {p.doctor.firstName} {p.doctor.lastName}
                    </td>
                    <td className="px-4 py-3 text-zinc-600">
                      <ul className="space-y-0.5">
                        {p.items.map((i) => (
                          <li key={i.id}>
                            {i.product.name}{" "}
                            <span className={`text-xs tabular-nums ${i.servedQuantity < i.quantity ? "font-semibold text-amber-700" : "text-zinc-400"}`}>
                              {i.servedQuantity}/{i.quantity}
                            </span>
                          </li>
                        ))}
                      </ul>
                      {p.instructions && <p className="mt-1 text-xs italic text-zinc-400">{p.instructions}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${st.tone}`}>{st.label}</span>
                    </td>
                    {canReorder && (
                      <td className="px-4 py-3 text-right">
                        <a
                          href={`/pos?rx=${p.id}`}
                          className="inline-flex items-center gap-1 rounded-full border border-emerald-200 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
                          title={p.status === "PARTIAL" ? "Adds what's left to serve to the POS cart" : "Adds these items to the POS cart"}
                        >
                          <RotateCcw className="h-3.5 w-3.5" /> Reorder
                        </a>
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-zinc-400">Served / prescribed is shown beside each item. Showing up to 500 — filter to narrow it down.</p>
    </div>
  );
}
