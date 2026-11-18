"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Loader2, Search, UserPlus, X } from "lucide-react";
import { formatDate, peso } from "@/lib/format";

interface CustomerRow {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  loyaltyPoints: number;
  totalSpent: number;
  lastPurchaseAt: string | null;
}

export default function CustomersList({
  customers,
  showPoints,
  pesoValuePerPoint,
  search,
  showInactive,
  page,
  pageCount,
  total,
}: {
  customers: CustomerRow[];
  showPoints: boolean;
  pesoValuePerPoint: number;
  search: string;
  showInactive: boolean;
  page: number;
  pageCount: number;
  total: number;
}) {
  const router = useRouter();
  const [query, setQuery] = useState(search);
  const [adding, setAdding] = useState(false);

  const go = (next: { search?: string; inactive?: boolean; page?: number }) => {
    const p = new URLSearchParams();
    const s = next.search ?? search;
    const inactive = next.inactive ?? showInactive;
    if (s) p.set("search", s);
    if (inactive) p.set("inactive", "1");
    if (next.page && next.page > 1) p.set("page", String(next.page));
    router.push(`/customers${p.size ? `?${p}` : ""}`);
  };

  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Customers</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {showPoints ? "Customer profiles, what they've bought, and their loyalty points." : "Customer profiles and what they've bought."}
          </p>
        </div>
        <button
          onClick={() => setAdding(true)}
          className="flex items-center gap-2 rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500 btn-press"
        >
          <UserPlus className="h-4 w-4" />
          Add customer
        </button>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <form
          className="relative min-w-[16rem] flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            go({ search: query.trim(), page: 1 });
          }}
        >
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name or mobile number, then press Enter"
            className="w-full rounded-lg border border-zinc-300 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
          />
        </form>
        <label className="flex items-center gap-2 text-sm text-zinc-600">
          <input type="checkbox" checked={showInactive} onChange={(e) => go({ inactive: e.target.checked, page: 1 })} className="h-4 w-4 accent-emerald-600" />
          Show deactivated
        </label>
      </div>

      <div className="mt-4 overflow-x-auto rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <table className="w-full min-w-[40rem] text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Mobile</th>
              {showPoints && <th className="px-4 py-3 text-right">Points</th>}
              <th className="px-4 py-3">Last purchase</th>
              <th className="px-4 py-3 text-right">Total spent</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {customers.length === 0 ? (
              <tr>
                <td colSpan={showPoints ? 5 : 4} className="px-4 py-10 text-center text-zinc-400">
                  {search ? "No customers match your search." : showInactive ? "No deactivated customers." : "No customers yet. They're added at checkout or with Add customer."}
                </td>
              </tr>
            ) : (
              customers.map((c) => (
                <tr key={c.id} className="cursor-pointer hover:bg-emerald-50/40" onClick={() => router.push(`/customers/${c.id}`)}>
                  <td className="px-4 py-3 font-medium text-zinc-900">
                    <Link href={`/customers/${c.id}`} onClick={(e) => e.stopPropagation()} className="hover:text-emerald-700">
                      {c.lastName}, {c.firstName}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-zinc-600">{c.phone ?? "—"}</td>
                  {showPoints && (
                    <td className="px-4 py-3 text-right tabular-nums">
                      <span className="font-semibold text-zinc-900">{c.loyaltyPoints.toLocaleString("en-PH")}</span>
                      <span className="ml-1 text-xs text-zinc-400">({peso(c.loyaltyPoints * pesoValuePerPoint)})</span>
                    </td>
                  )}
                  <td className="px-4 py-3 text-zinc-600">{c.lastPurchaseAt ? formatDate(c.lastPurchaseAt) : "—"}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-zinc-900">{peso(c.totalSpent)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {pageCount > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm text-zinc-500">
          <span>
            {total.toLocaleString("en-PH")} customers · page {page} of {pageCount}
          </span>
          <div className="flex gap-2">
            <button disabled={page <= 1} onClick={() => go({ page: page - 1 })} className="flex items-center gap-1 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 disabled:opacity-40">
              <ChevronLeft className="h-4 w-4" /> Previous
            </button>
            <button disabled={page >= pageCount} onClick={() => go({ page: page + 1 })} className="flex items-center gap-1 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 disabled:opacity-40">
              Next <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {adding && <AddCustomerModal onClose={() => setAdding(false)} onAdded={(id) => router.push(`/customers/${id}`)} />}
    </div>
  );
}

function AddCustomerModal({ onClose, onAdded }: { onClose: () => void; onAdded: (id: string) => void }) {
  const [form, setForm] = useState({ firstName: "", lastName: "", phone: "", email: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = "w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.firstName.trim() || !form.lastName.trim()) {
      setError("Enter the customer's first and last name.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName: form.firstName.trim(), lastName: form.lastName.trim(), phone: form.phone.trim(), email: form.email.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Couldn't add the customer.");
        return;
      }
      onAdded(data.id);
    } catch {
      setError("Network error.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form onSubmit={submit} className="w-full max-w-md space-y-3 rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-900">Add customer</h2>
          <button type="button" onClick={onClose} className="p-1 text-zinc-400 hover:text-zinc-600">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <input autoFocus value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} placeholder="First name" className={input} />
          <input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} placeholder="Last name" className={input} />
        </div>
        <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Mobile number (optional)" inputMode="tel" className={input} />
        <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Email (optional)" type="email" className={input} />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="rounded-full border border-zinc-300 px-4 py-2 text-sm text-zinc-700">
            Cancel
          </button>
          <button type="submit" disabled={saving} className="flex items-center gap-2 rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-60">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Add customer
          </button>
        </div>
      </form>
    </div>
  );
}
