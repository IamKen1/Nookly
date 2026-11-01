"use client";

import { useState } from "react";
import { AlertTriangle, ChevronLeft, ClipboardList, Loader2, X } from "lucide-react";
import { peso } from "@/lib/format";

export interface PendingOrderLine {
  productId: string;
  name: string;
  strength: string | null;
  dosageForm: string | null;
  price: number;
  quantity: number;
  currentStock: number;
  isVatable: boolean;
  requiresPrescription: boolean;
}

export interface PendingOrder {
  id: string;
  orderNumber: string;
  orderRemarks: string | null;
  createdAt: string;
  createdBy: { id: string; name: string };
  items: PendingOrderLine[];
}

const orderTotal = (o: PendingOrder) => o.items.reduce((sum, i) => sum + i.price * i.quantity, 0);
const itemCount = (o: PendingOrder) => o.items.reduce((sum, i) => sum + i.quantity, 0);
const hasShortStock = (o: PendingOrder) => o.items.some((i) => i.quantity > i.currentStock);
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" });

function waited(iso: string) {
  const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "<1 min";
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

// Queue on the left (oldest first, so the cashier serves first in, first out),
// the selected order's details on the right. Stays compact however long the queue gets.
export default function PendingOrdersModal({
  isOpen,
  orders,
  onClose,
  onLoad,
  onCancelled,
}: {
  isOpen: boolean;
  orders: PendingOrder[];
  onClose: () => void;
  onLoad: (order: PendingOrder) => void;
  onCancelled: () => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // On phones only one pane fits; this shows the details pane instead of the queue.
  const [showDetail, setShowDetail] = useState(false);

  if (!isOpen) return null;

  // Orders arrive oldest first from the API; keep that order.
  const selected = orders.find((o) => o.id === selectedId) ?? orders[0] ?? null;
  const position = selected ? orders.indexOf(selected) : -1;

  const cancel = async (order: PendingOrder) => {
    if (!confirm(`Cancel order ${order.orderNumber} from ${order.createdBy.name}?`)) return;
    setBusyId(order.id);
    setError(null);
    try {
      const res = await fetch(`/api/pending-orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to cancel the order.");
        return;
      }
      setSelectedId(null);
      setShowDetail(false);
      onCancelled();
    } catch {
      setError("Network error.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex h-[min(85vh,640px)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-emerald-600" />
            <h2 className="text-base font-bold text-gray-900">Orders waiting for payment</h2>
            {orders.length > 0 && (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">{orders.length}</span>
            )}
          </div>
          <button
            onClick={() => {
              setShowDetail(false);
              onClose();
            }}
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && <p className="mx-5 mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

        {orders.length === 0 || !selected ? (
          <p className="flex flex-1 items-center justify-center text-sm text-gray-500">No orders waiting right now.</p>
        ) : (
          <div className="flex min-h-0 flex-1">
            {/* Queue */}
            <div className={`min-h-0 w-full flex-col border-r border-gray-100 sm:flex sm:w-72 sm:shrink-0 ${showDetail ? "hidden" : "flex"}`}>
              <p className="border-b border-gray-100 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Oldest first</p>
              <ul className="min-h-0 flex-1 divide-y divide-gray-100 overflow-y-auto">
                {orders.map((o, idx) => {
                  const active = o.id === selected.id;
                  return (
                    <li key={o.id}>
                      <button
                        onClick={() => {
                          setSelectedId(o.id);
                          setShowDetail(true);
                        }}
                        className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition ${
                          active ? "bg-emerald-50" : "hover:bg-gray-50"
                        }`}
                      >
                        <span
                          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold tabular-nums ${
                            idx === 0 ? "bg-emerald-600 text-white" : "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {idx + 1}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5">
                            <span className="truncate text-sm font-semibold text-gray-900">{o.orderNumber}</span>
                            {hasShortStock(o) && <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-red-500" aria-label="Not enough stock" />}
                          </span>
                          <span className="block truncate text-xs text-gray-500">
                            {o.createdBy.name} · waiting {waited(o.createdAt)}
                          </span>
                        </span>
                        <span className="shrink-0 text-right">
                          <span className="block text-sm font-semibold tabular-nums text-gray-900">{peso(orderTotal(o))}</span>
                          <span className="block text-[11px] text-gray-400">
                            {itemCount(o)} item{itemCount(o) === 1 ? "" : "s"}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>

            {/* Selected order */}
            <div className={`min-h-0 min-w-0 flex-1 flex-col sm:flex ${showDetail ? "flex" : "hidden"}`}>
              <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-5 py-3">
                <div className="min-w-0">
                  <button onClick={() => setShowDetail(false)} className="mb-1 flex items-center gap-0.5 text-xs font-semibold text-emerald-700 sm:hidden">
                    <ChevronLeft className="h-3.5 w-3.5" /> All orders
                  </button>
                  <p className="flex items-center gap-2 text-sm font-bold text-gray-900">
                    {selected.orderNumber}
                    {position === 0 ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">Next</span>
                    ) : (
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-600">#{position + 1} in line</span>
                    )}
                  </p>
                  <p className="text-xs text-gray-500">
                    Taken by {selected.createdBy.name} · {timeOf(selected.createdAt)}
                  </p>
                </div>
                <p className="shrink-0 text-lg font-bold tabular-nums text-emerald-700">{peso(orderTotal(selected))}</p>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                      <th className="pb-2 font-semibold">Item</th>
                      <th className="pb-2 text-right font-semibold">Qty</th>
                      <th className="pb-2 text-right font-semibold">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {selected.items.map((i) => (
                      <tr key={i.productId}>
                        <td className="py-2 pr-2">
                          <p className="text-gray-800">{i.name}</p>
                          <p className="text-xs text-gray-400">
                            {[i.strength, i.dosageForm].filter(Boolean).join(" · ")}
                            {i.requiresPrescription && <span className="ml-1 font-semibold text-violet-600">Rx</span>}
                            {i.quantity > i.currentStock && <span className="ml-1 font-semibold text-red-600">Only {i.currentStock} left</span>}
                          </p>
                        </td>
                        <td className="py-2 text-right tabular-nums text-gray-700">{i.quantity}</td>
                        <td className="py-2 text-right tabular-nums text-gray-900">{peso(i.price * i.quantity)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {selected.orderRemarks && (
                  <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    <span className="font-semibold">Note:</span> {selected.orderRemarks}
                  </p>
                )}
              </div>

              <div className="flex gap-2 border-t border-gray-100 px-5 py-3">
                <button
                  onClick={() => onLoad(selected)}
                  className="flex-1 rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 btn-press"
                >
                  Load to cart
                </button>
                <button
                  onClick={() => cancel(selected)}
                  disabled={busyId === selected.id}
                  className="flex items-center justify-center gap-1.5 rounded-lg border border-red-200 px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 btn-press"
                >
                  {busyId === selected.id && <Loader2 className="h-4 w-4 animate-spin" />}
                  Cancel order
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
