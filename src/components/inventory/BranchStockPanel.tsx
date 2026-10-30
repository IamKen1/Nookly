"use client";

import { useState } from "react";
import useSWR from "swr";
import { ArrowRightLeft, Loader2, Search, Trash2, X } from "lucide-react";
import { formatDateTime } from "@/lib/format";
import { useDebouncedValue } from "@/lib/useDebouncedValue";

interface BranchStock {
  stores: { id: string; name: string }[];
  products: { id: string; name: string; minimumStock: number; byStore: Record<string, number> }[];
}

interface Transfer {
  reference: string;
  createdAt: string;
  by: string;
  notes: string | null;
  from: string;
  to: string;
  items: { name: string; quantity: number }[];
}

interface ProductOption {
  id: string;
  name: string;
  currentStock: number;
}

export default function BranchStockPanel({
  stores,
  currentStoreId,
  canTransfer,
}: {
  stores: { id: string; name: string }[];
  currentStoreId: string | null;
  // False when the plan lacks multi-branch transfer or the role can't adjust stock.
  canTransfer: boolean;
}) {
  const [search, setSearch] = useState("");
  const debounced = useDebouncedValue(search, 300);
  const { data, isLoading } = useSWR<BranchStock>(`/api/inventory/branch-stock${debounced ? `?search=${encodeURIComponent(debounced)}` : ""}`, {
    keepPreviousData: true,
  });
  const { data: transfers = [], mutate: refreshTransfers } = useSWR<Transfer[]>("/api/inventory/transfer");
  const [showTransfer, setShowTransfer] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const currentName = stores.find((s) => s.id === currentStoreId)?.name ?? "this branch";

  return (
    <div className="mt-4 space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-1 items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2">
          <Search className="h-4 w-4 text-zinc-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Find which branch has an item..."
            className="w-full text-sm outline-none"
          />
        </div>
        {canTransfer && (
          <button
            onClick={() => {
              setMessage(null);
              setShowTransfer(true);
            }}
            className="flex items-center gap-2 rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 btn-press"
          >
            <ArrowRightLeft className="h-4 w-4" /> Transfer stock
          </button>
        )}
      </div>

      {message && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">{message}</p>}

      <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-100 text-left text-xs font-medium uppercase text-zinc-400">
              <th className="px-4 py-3">Product</th>
              {(data?.stores ?? stores).map((s) => (
                <th key={s.id} className={`px-4 py-3 text-right ${s.id === currentStoreId ? "text-emerald-700" : ""}`}>
                  {s.name}
                </th>
              ))}
              <th className="px-4 py-3 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && !data ? (
              <tr>
                <td colSpan={stores.length + 2} className="px-4 py-8 text-center text-zinc-400">
                  Loading...
                </td>
              </tr>
            ) : (data?.products ?? []).length === 0 ? (
              <tr>
                <td colSpan={stores.length + 2} className="px-4 py-8 text-center text-zinc-400">
                  No products found.
                </td>
              </tr>
            ) : (
              data!.products.map((p) => {
                const total = Object.values(p.byStore).reduce((a, b) => a + b, 0);
                return (
                  <tr key={p.id} className="border-b border-zinc-50 last:border-0">
                    <td className="px-4 py-2.5 text-zinc-900">{p.name}</td>
                    {data!.stores.map((s) => {
                      const qty = p.byStore[s.id] ?? 0;
                      return (
                        <td
                          key={s.id}
                          className={`px-4 py-2.5 text-right tabular-nums ${
                            qty === 0 ? "text-red-500" : qty <= p.minimumStock ? "text-amber-600" : "text-zinc-700"
                          }`}
                        >
                          {qty}
                        </td>
                      );
                    })}
                    <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-zinc-900">{total}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
        {(data?.products.length ?? 0) >= 100 && <p className="px-4 py-2 text-xs text-zinc-400">Showing the first 100 — search to narrow it down.</p>}
      </div>

      <div>
        <h3 className="text-sm font-semibold text-zinc-900">Transfers involving {currentName}</h3>
        <div className="mt-2 overflow-hidden rounded-2xl border border-zinc-200 bg-white">
          {transfers.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-zinc-400">No transfers yet.</p>
          ) : (
            transfers.map((t) => (
              <div key={t.reference} className="border-b border-zinc-100 px-4 py-3 text-sm last:border-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium text-zinc-900">
                    {t.from} <span className="text-zinc-400">→</span> {t.to}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {t.reference} · {formatDateTime(t.createdAt)} · by {t.by}
                  </p>
                </div>
                <p className="mt-1 text-xs text-zinc-600">{t.items.map((i) => `${i.quantity} × ${i.name}`).join(", ")}</p>
                {t.notes && <p className="mt-1 text-xs italic text-zinc-500">&ldquo;{t.notes}&rdquo;</p>}
              </div>
            ))
          )}
        </div>
      </div>

      {showTransfer && (
        <TransferModal
          stores={stores.filter((s) => s.id !== currentStoreId)}
          fromName={currentName}
          onClose={() => setShowTransfer(false)}
          onDone={(msg) => {
            setShowTransfer(false);
            setMessage(msg);
            refreshTransfers();
          }}
        />
      )}
    </div>
  );
}

function TransferModal({
  stores,
  fromName,
  onClose,
  onDone,
}: {
  stores: { id: string; name: string }[];
  fromName: string;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [toStoreId, setToStoreId] = useState(stores[0]?.id ?? "");
  const [lines, setLines] = useState<{ productId: string; name: string; quantity: number; max: number }[]>([]);
  const [notes, setNotes] = useState("");
  const [search, setSearch] = useState("");
  const debounced = useDebouncedValue(search, 250);
  const { data: results = [] } = useSWR<ProductOption[]>(debounced ? `/api/products?search=${encodeURIComponent(debounced)}` : null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addLine = (p: ProductOption) => {
    if (lines.some((l) => l.productId === p.id) || p.currentStock <= 0) return;
    setLines([...lines, { productId: p.id, name: p.name, quantity: 1, max: p.currentStock }]);
    setSearch("");
  };

  const submit = async () => {
    setError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/inventory/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toStoreId, notes, items: lines.map((l) => ({ productId: l.productId, quantity: l.quantity })) }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Transfer failed.");
        return;
      }
      onDone(`Transfer ${data.reference} done — ${data.itemCount} product(s) moved from ${data.from} to ${data.to}.`);
    } catch {
      setError("Network error.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-zinc-100 px-6 py-4">
          <h2 className="text-lg font-semibold text-zinc-900">Transfer stock</h2>
          <button onClick={onClose}>
            <X className="h-5 w-5 text-zinc-400" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="mb-1 text-xs font-medium text-zinc-500">From</p>
              <p className="rounded-lg bg-zinc-50 px-3 py-2 font-medium text-zinc-800">{fromName}</p>
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-zinc-500">To</p>
              <select
                value={toStoreId}
                onChange={(e) => setToStoreId(e.target.value)}
                className="w-full rounded-lg border border-zinc-300 px-3 py-2"
              >
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="relative">
            <div className="flex items-center gap-2 rounded-lg border border-zinc-300 px-3 py-2">
              <Search className="h-4 w-4 text-zinc-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={`Add a product from ${fromName}...`}
                className="w-full text-sm outline-none"
              />
            </div>
            {debounced && results.length > 0 && (
              <div className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-zinc-200 bg-white shadow-lg">
                {results.slice(0, 20).map((p) => (
                  <button
                    key={p.id}
                    onClick={() => addLine(p)}
                    disabled={p.currentStock <= 0}
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-emerald-50 disabled:opacity-40"
                  >
                    <span className="truncate">{p.name}</span>
                    <span className="shrink-0 text-xs text-zinc-500">{p.currentStock} in stock</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {lines.length === 0 ? (
            <p className="py-4 text-center text-sm text-zinc-400">No products added yet.</p>
          ) : (
            <div className="space-y-2">
              {lines.map((l) => (
                <div key={l.productId} className="flex items-center gap-3 rounded-lg bg-zinc-50 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-zinc-900">{l.name}</p>
                    <p className="text-xs text-zinc-500">{l.max} available</p>
                  </div>
                  <input
                    type="number"
                    min={1}
                    max={l.max}
                    value={l.quantity}
                    onChange={(e) => {
                      const q = Math.max(1, Math.min(l.max, Math.trunc(Number(e.target.value) || 1)));
                      setLines(lines.map((x) => (x.productId === l.productId ? { ...x, quantity: q } : x)));
                    }}
                    className="w-20 rounded-lg border border-zinc-300 px-2 py-1 text-right text-sm"
                  />
                  <button onClick={() => setLines(lines.filter((x) => x.productId !== l.productId))} className="text-zinc-400 hover:text-red-600">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes (optional) — e.g., who delivered it"
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
          />
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-zinc-100 px-6 py-4">
          <button onClick={onClose} className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-700 hover:border-zinc-400">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={saving || lines.length === 0 || !toStoreId}
            className="flex items-center gap-2 rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50 btn-press"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {saving ? "Transferring..." : "Transfer"}
          </button>
        </div>
      </div>
    </div>
  );
}
