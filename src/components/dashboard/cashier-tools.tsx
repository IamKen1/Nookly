"use client";

import { useState } from "react";
import useSWR from "swr";
import { Loader2, Printer, Search } from "lucide-react";
import { peso } from "@/lib/format";
import { useDebouncedValue } from "@/lib/useDebouncedValue";
import { printReceipt } from "@/lib/receipt";
import type { ReceiptData } from "@/types/receipt";

interface ProductHit {
  id: string;
  name: string;
  strength: string | null;
  dosageForm: string | null;
  sellingPrice: string;
  branchPrice?: number | null;
  currentStock: number;
  minimumStock: number;
  requiresPrescription: boolean;
}

// Quick price and stock lookup that doesn't touch the POS cart.
// Uses the same list the POS sells from, so price and stock are this branch's.
export function PriceCheck() {
  const [q, setQ] = useState("");
  const query = useDebouncedValue(q.trim(), 250);
  const { data = [], isLoading } = useSWR<ProductHit[]>(query.length >= 2 ? `/api/products?forSale=1&search=${encodeURIComponent(query)}` : null);
  const hits = data.slice(0, 6);

  return (
    <div>
      <label className="flex items-center gap-2 rounded-xl border border-zinc-300 bg-white px-3 py-2.5 focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-500/20">
        <Search className="h-4 w-4 text-zinc-400" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Product name, generic, or barcode"
          className="w-full bg-transparent text-sm outline-none"
          aria-label="Check price and stock"
        />
        {isLoading && <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />}
      </label>
      {query.length >= 2 && !isLoading && hits.length === 0 && <p className="mt-3 text-center text-sm text-zinc-400">No product matches “{query}”.</p>}
      {hits.length > 0 && (
        <ul className="mt-2 divide-y divide-zinc-100">
          {hits.map((p) => {
            const price = p.branchPrice ?? Number(p.sellingPrice);
            const out = p.currentStock <= 0;
            const low = !out && p.currentStock <= p.minimumStock;
            return (
              <li key={p.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm text-zinc-800">{p.name}</p>
                  <p className="text-xs text-zinc-400">
                    {[p.strength, p.dosageForm].filter(Boolean).join(" · ")}
                    {p.requiresPrescription && <span className="ml-1 font-semibold text-violet-600">Rx</span>}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold tabular-nums text-zinc-900">{peso(price)}</p>
                  <p className={`text-xs font-medium ${out ? "text-red-600" : low ? "text-amber-700" : "text-emerald-700"}`}>
                    {out ? "Out of stock" : `${p.currentStock} in stock`}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// Reprints a past receipt for a customer who asks for another copy.
export function ReprintButton({ saleId }: { saleId: string }) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const reprint = async () => {
    setBusy(true);
    setFailed(false);
    try {
      const res = await fetch(`/api/sales/${saleId}/receipt`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      printReceipt({ ...json, date: new Date(json.date) } as ReceiptData);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <button
      type="button"
      onClick={reprint}
      disabled={busy}
      className="inline-flex items-center gap-1 rounded-full border border-zinc-200 px-2.5 py-1 text-xs font-semibold text-zinc-600 hover:border-emerald-300 hover:text-emerald-700 disabled:opacity-50"
      title="Print this receipt again"
    >
      {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Printer className="h-3 w-3" />}
      {failed ? "Retry" : "Reprint"}
    </button>
  );
}

interface WaitingOrder {
  id: string;
  orderNumber: string;
  createdAt: string;
  takenBy: string;
  itemCount: number;
  total: number;
}

interface PendingOrderResponse {
  id: string;
  orderNumber: string;
  createdAt: string;
  createdBy: { name: string };
  items: { quantity: number; price: number }[];
}

const timePH = (iso: string) => new Date(iso).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" });

// Orders from order takers, kept current without a reload. Only rendered for
// branches that have order takers, so other workspaces never poll.
export function LiveWaitingOrders({ initial, canOpenPos }: { initial: WaitingOrder[]; canOpenPos: boolean }) {
  const { data } = useSWR<PendingOrderResponse[]>("/api/pending-orders", { refreshInterval: 4000, revalidateOnFocus: true });
  const orders: WaitingOrder[] = data
    ? data.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        createdAt: o.createdAt,
        takenBy: o.createdBy.name,
        itemCount: o.items.reduce((s, i) => s + i.quantity, 0),
        total: o.items.reduce((s, i) => s + i.quantity * i.price, 0),
      }))
    : initial;

  return (
    <section className="min-w-0 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
            Orders waiting for you
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" /> Live
            </span>
          </h2>
          <p className="mt-0.5 text-xs text-zinc-500">Open Orders in the POS to load one into the cart</p>
        </div>
        {canOpenPos && (
          <a href="/pos" className="shrink-0 text-xs font-semibold text-emerald-700 hover:text-emerald-900">
            Open POS →
          </a>
        )}
      </div>
      {orders.length === 0 ? (
        <p className="py-4 text-center text-sm text-zinc-400">No orders waiting. New ones appear here automatically.</p>
      ) : (
        <ul className="divide-y divide-zinc-100">
          {orders.map((o) => (
            <li key={o.id} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="text-sm font-medium text-zinc-800">{o.orderNumber}</p>
                <p className="text-xs text-zinc-400">
                  From {o.takenBy} · {timePH(o.createdAt)} · {o.itemCount} item{o.itemCount === 1 ? "" : "s"}
                </p>
              </div>
              <p className="shrink-0 text-sm font-semibold tabular-nums text-zinc-900">{peso(o.total)}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
