"use client";

import { useState } from "react";
import { Loader2, X } from "lucide-react";

export interface SupplierDetails {
  id?: string;
  name: string;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  tin: string | null;
  paymentTermsDays: number;
  notes: string | null;
  isActive?: boolean;
}

const TERMS = [0, 7, 15, 30, 45, 60, 90];
export const termsLabel = (days: number) => (days === 0 ? "Cash on delivery" : `${days} days`);

// Add or edit a supplier's details and payment terms.
export default function SupplierForm({ initial, onClose, onSaved }: { initial?: SupplierDetails; onClose: () => void; onSaved: (id: string) => void }) {
  const [f, setF] = useState({
    name: initial?.name ?? "",
    contactPerson: initial?.contactPerson ?? "",
    phone: initial?.phone ?? "",
    email: initial?.email ?? "",
    address: initial?.address ?? "",
    tin: initial?.tin ?? "",
    paymentTermsDays: String(initial?.paymentTermsDays ?? 30),
    notes: initial?.notes ?? "",
  });
  const custom = !TERMS.includes(Number(f.paymentTermsDays));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(initial?.id ? `/api/suppliers/${initial.id}` : "/api/suppliers", {
        method: initial?.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...f, paymentTermsDays: Number(f.paymentTermsDays) }),
      });
      const data = await res.json();
      if (!res.ok) return setError(data.error ?? "Couldn't save the supplier.");
      onSaved(data.id);
    } catch {
      setError("Network error.");
    } finally {
      setSaving(false);
    }
  };

  const input = "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20";
  const label = "mb-1 block text-xs font-medium text-zinc-600";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form onSubmit={save} className="flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4">
          <h2 className="text-lg font-semibold text-zinc-900">{initial?.id ? "Edit supplier" : "Add supplier"}</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto px-5 py-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={label}>Supplier name</label>
            <input autoFocus required value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Zuellig Pharma" className={input} />
          </div>
          <div>
            <label className={label}>Contact person</label>
            <input value={f.contactPerson} onChange={(e) => set("contactPerson", e.target.value)} className={input} />
          </div>
          <div>
            <label className={label}>Phone</label>
            <input value={f.phone} onChange={(e) => set("phone", e.target.value)} className={input} />
          </div>
          <div>
            <label className={label}>Email</label>
            <input type="email" value={f.email} onChange={(e) => set("email", e.target.value)} className={input} />
          </div>
          <div>
            <label className={label}>TIN</label>
            <input value={f.tin} onChange={(e) => set("tin", e.target.value)} placeholder="000-000-000-000" className={input} />
          </div>
          <div className="sm:col-span-2">
            <label className={label}>Address</label>
            <input value={f.address} onChange={(e) => set("address", e.target.value)} className={input} />
          </div>
          <div className="sm:col-span-2">
            <label className={label}>Payment terms</label>
            <div className="flex flex-wrap gap-1.5">
              {TERMS.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => set("paymentTermsDays", String(d))}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                    Number(f.paymentTermsDays) === d && !custom ? "border-emerald-600 bg-emerald-600 text-white" : "border-zinc-300 text-zinc-600 hover:border-zinc-400"
                  }`}
                >
                  {d === 0 ? "COD" : `${d} days`}
                </button>
              ))}
              <span className="flex items-center gap-1.5 text-xs text-zinc-500">
                or
                <input
                  type="number"
                  min={0}
                  max={365}
                  value={f.paymentTermsDays}
                  onChange={(e) => set("paymentTermsDays", e.target.value)}
                  className="w-16 rounded-lg border border-zinc-300 px-2 py-1 text-right text-xs"
                  aria-label="Days"
                />
                days
              </span>
            </div>
            <p className="mt-1 text-xs text-zinc-400">Deliveries fall due this many days after they&apos;re received.</p>
          </div>
          <div className="sm:col-span-2">
            <label className={label}>Notes</label>
            <textarea value={f.notes} onChange={(e) => set("notes", e.target.value)} rows={2} placeholder="e.g. Delivers Tue & Fri; accepts returns 3 months before expiry" className={input} />
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-zinc-100 bg-zinc-50 px-5 py-3">
          <p className="min-w-0 text-sm text-red-600">{error}</p>
          <div className="flex shrink-0 gap-2">
            <button type="button" onClick={onClose} className="rounded-full border border-zinc-300 px-4 py-2 text-sm text-zinc-700 hover:bg-white">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="flex items-center gap-2 rounded-full bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Save supplier
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
