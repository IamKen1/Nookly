"use client";

import { useState } from "react";
import { Loader2, X } from "lucide-react";
import { peso } from "@/lib/format";

export default function BranchPricesModal({
  product,
  stores,
  onClose,
  onSaved,
}: {
  product: { id: string; name: string; basePrice: number; branchPrices: Record<string, number>; notSoldAt: string[] };
  stores: { id: string; name: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  // Blank = sell at the product's own price.
  const [draft, setDraft] = useState<Record<string, string>>(
    Object.fromEntries(stores.map((s) => [s.id, product.branchPrices[s.id] != null ? String(product.branchPrices[s.id]) : ""]))
  );
  const [sold, setSold] = useState<Record<string, boolean>>(Object.fromEntries(stores.map((s) => [s.id, !product.notSoldAt.includes(s.id)])));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setError(null);
    const prices = stores.map((s) => {
      const raw = draft[s.id].trim();
      return { storeId: s.id, price: raw === "" ? null : Number(raw), sold: sold[s.id] };
    });
    if (prices.some((p) => p.price !== null && (!Number.isFinite(p.price) || p.price < 0))) {
      setError("Enter a valid price, or leave it blank to use the default.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/products/${product.id}/branch-prices`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prices }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Failed to save prices.");
        return;
      }
      onSaved();
    } catch {
      setError("Network error.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-zinc-100 px-6 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold text-zinc-900">Branch settings</h2>
            <p className="truncate text-xs text-zinc-500">{product.name}</p>
          </div>
          <button onClick={onClose}>
            <X className="h-5 w-5 text-zinc-400" />
          </button>
        </div>
        <div className="space-y-3 px-6 py-4">
          <p className="text-sm text-zinc-600">
            Default price: <span className="font-semibold text-zinc-900">{peso(product.basePrice)}</span>. Leave a price blank to use it.
            Untick a branch that doesn&apos;t sell this product — it won&apos;t appear in that branch&apos;s POS.
          </p>
          {stores.map((s) => (
            <div key={s.id} className="flex items-center gap-3">
              <label className="flex min-w-0 flex-1 items-center gap-2 text-sm text-zinc-800">
                <input type="checkbox" checked={sold[s.id]} onChange={(e) => setSold({ ...sold, [s.id]: e.target.checked })} />
                <span className={`truncate ${sold[s.id] ? "" : "text-zinc-400 line-through"}`}>{s.name}</span>
              </label>
              <span className="text-sm text-zinc-400">₱</span>
              <input
                type="number"
                min={0}
                step="0.01"
                value={draft[s.id]}
                placeholder={product.basePrice.toFixed(2)}
                onChange={(e) => setDraft({ ...draft, [s.id]: e.target.value })}
                disabled={!sold[s.id]}
                className="w-28 rounded-lg border border-zinc-300 px-2 py-1.5 text-right text-sm disabled:bg-zinc-50 disabled:text-zinc-300"
              />
            </div>
          ))}
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-zinc-100 px-6 py-4">
          <button onClick={onClose} className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-700 hover:border-zinc-400">
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="flex items-center gap-2 rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50 btn-press"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
