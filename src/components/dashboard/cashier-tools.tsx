"use client";

import { useState } from "react";
import useSWR from "swr";
import { Check, Loader2, Printer, Search } from "lucide-react";
import { peso } from "@/lib/format";
import { useDebouncedValue } from "@/lib/useDebouncedValue";
import { printReceiptAnywhere } from "@/lib/printer/print-receipt";
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

interface BranchAvailability {
  storeId: string;
  name: string;
  isCurrent: boolean;
  stock: number;
  price: number;
}

// Quick price and stock lookup that doesn't touch the POS cart. By default it
// searches what this branch sells; with "Search all branches" (multi-branch
// workspaces) every branch's price and stock is listed, one row per branch.
export function PriceCheck({ showBranches = false, startWithAllBranches = false }: { showBranches?: boolean; startWithAllBranches?: boolean }) {
  const [q, setQ] = useState("");
  const [allBranches, setAllBranches] = useState(startWithAllBranches);
  const query = useDebouncedValue(q.trim(), 250);
  const wide = showBranches && allBranches;
  // All branches: the whole catalog, so items this branch doesn't carry still show.
  const { data = [], isLoading } = useSWR<ProductHit[]>(
    query.length >= 2 ? `/api/products?${wide ? "" : "forSale=1&"}search=${encodeURIComponent(query)}` : null
  );
  const hits = data.slice(0, wide ? 8 : 10);
  const ids = hits.map((h) => h.id).join(",");
  const { data: availability = {}, isLoading: loadingBranches } = useSWR<Record<string, BranchAvailability[]>>(
    wide && ids ? `/api/products/availability?ids=${ids}` : null
  );

  const stockCell = (stock: number, minimum: number) => (
    <span className={`font-medium tabular-nums ${stock <= 0 ? "text-red-600" : stock <= minimum ? "text-amber-700" : "text-zinc-800"}`}>
      {stock <= 0 ? "Out" : stock.toLocaleString("en-PH")}
    </span>
  );
  const th = "px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-zinc-500";

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-zinc-300 bg-white px-3 py-2.5 focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-500/20">
          <Search className="h-4 w-4 text-zinc-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Product name, generic, or barcode"
            className="w-full bg-transparent text-sm outline-none"
            aria-label="Check price and stock"
          />
          {(isLoading || loadingBranches) && <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />}
        </label>
        {showBranches && (
          <label className="flex shrink-0 items-center gap-2 text-sm text-zinc-700">
            <input type="checkbox" checked={allBranches} onChange={(e) => setAllBranches(e.target.checked)} className="h-4 w-4 accent-emerald-600" />
            Search all branches
          </label>
        )}
      </div>

      {query.length >= 2 && !isLoading && hits.length === 0 && <p className="mt-3 text-center text-sm text-zinc-400">No product matches &ldquo;{query}&rdquo;.</p>}

      {hits.length > 0 && (
        <div className="mt-3 overflow-x-auto rounded-lg border border-zinc-200">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50">
              <tr>
                <th className={th}>Product</th>
                {wide && <th className={th}>Branch</th>}
                <th className={`${th} text-right`}>Price</th>
                <th className={`${th} text-right`}>Stock</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {hits.map((p) => {
                const detail = [p.strength, p.dosageForm].filter(Boolean).join(" · ");
                const name = (
                  <>
                    <span className="text-zinc-800">{p.name}</span>
                    {p.requiresPrescription && <span className="ml-1 text-[11px] font-semibold text-violet-600">Rx</span>}
                    {detail && <span className="block text-xs text-zinc-400">{detail}</span>}
                  </>
                );
                if (!wide) {
                  return (
                    <tr key={p.id}>
                      <td className="px-3 py-2">{name}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-zinc-900">{peso(p.branchPrice ?? Number(p.sellingPrice))}</td>
                      <td className="px-3 py-2 text-right">{stockCell(p.currentStock, p.minimumStock)}</td>
                    </tr>
                  );
                }
                const branches = availability[p.id] ?? [];
                if (branches.length === 0) {
                  return (
                    <tr key={p.id}>
                      <td className="px-3 py-2">{name}</td>
                      <td className="px-3 py-2 text-xs text-zinc-400" colSpan={3}>
                        {loadingBranches ? "Loading..." : "Not sold at any branch"}
                      </td>
                    </tr>
                  );
                }
                // This branch first, then branches with stock, then the rest.
                const ordered = [...branches].sort((a, b) => Number(b.isCurrent) - Number(a.isCurrent) || Number(b.stock > 0) - Number(a.stock > 0));
                return ordered.map((b, i) => (
                  <tr key={`${p.id}:${b.storeId}`} className={b.isCurrent ? "bg-emerald-50/40" : ""}>
                    {i === 0 && (
                      <td className="px-3 py-2 align-top" rowSpan={ordered.length}>
                        {name}
                      </td>
                    )}
                    <td className="px-3 py-2 text-zinc-700">
                      {b.name}
                      {b.isCurrent && <span className="ml-1.5 text-[11px] font-semibold text-emerald-700">This branch</span>}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-zinc-900">{peso(b.price)}</td>
                    <td className="px-3 py-2 text-right">{stockCell(b.stock, p.minimumStock)}</td>
                  </tr>
                ));
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// Reprints a past receipt for a customer who asks for another copy — on the
// counter's thermal printer when one is paired, like the POS does, otherwise
// through the browser's print dialog.
export function ReprintButton({ saleId }: { saleId: string }) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "failed">("idle");
  const reprint = async () => {
    setState("busy");
    try {
      const res = await fetch(`/api/sales/${saleId}/receipt`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      await printReceiptAnywhere({ ...json, date: new Date(json.date) } as ReceiptData);
      setState("done");
      setTimeout(() => setState("idle"), 2500);
    } catch {
      setState("failed");
    }
  };
  return (
    <button
      type="button"
      onClick={reprint}
      disabled={state === "busy"}
      className="inline-flex items-center gap-1 rounded-full border border-zinc-200 px-2.5 py-1 text-xs font-semibold text-zinc-600 hover:border-emerald-300 hover:text-emerald-700 disabled:opacity-50"
      title="Print this receipt again"
    >
      {state === "busy" ? <Loader2 className="h-3 w-3 animate-spin" /> : state === "done" ? <Check className="h-3 w-3 text-emerald-600" /> : <Printer className="h-3 w-3" />}
      {state === "failed" ? "Retry" : state === "done" ? "Printed" : "Reprint"}
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

// Orders sent to the cashier, kept current without a reload. Only rendered for
// branches where some role can send orders, so other workspaces never poll.
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
          {/* Oldest first; the full queue lives in the POS so the card stays short. */}
          {orders.slice(0, 5).map((o) => (
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
          {orders.length > 5 && (
            <li className="pt-2.5 text-xs font-medium text-zinc-500">
              +{orders.length - 5} more waiting{canOpenPos ? " — open Orders in the POS to see all" : ""}
            </li>
          )}
        </ul>
      )}
    </section>
  );
}
