"use client";

import { useState } from "react";
import { ClipboardList, Loader2, X } from "lucide-react";
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

  if (!isOpen) return null;

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
      onCancelled();
    } catch {
      setError("Network error.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-emerald-600" />
            <h2 className="text-base font-bold text-gray-900">Orders waiting for payment</h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && <p className="mx-5 mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

        <div className="flex-1 space-y-3 overflow-y-auto p-5">
          {orders.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">No orders waiting right now.</p>
          ) : (
            orders.map((order) => {
              const total = order.items.reduce((sum, i) => sum + i.price * i.quantity, 0);
              return (
                <div key={order.id} className="rounded-xl border border-gray-200 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold text-gray-900">{order.orderNumber}</p>
                      <p className="text-xs text-gray-500">
                        Taken by {order.createdBy.name} ·{" "}
                        {new Date(order.createdAt).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" })}
                      </p>
                    </div>
                    <p className="text-sm font-bold text-emerald-700">{peso(total)}</p>
                  </div>
                  <ul className="mt-2 space-y-0.5 text-xs text-gray-600">
                    {order.items.map((i) => (
                      <li key={i.productId} className="flex justify-between gap-2">
                        <span className="truncate">
                          {i.quantity} × {i.name}
                        </span>
                        {i.quantity > i.currentStock && <span className="shrink-0 font-semibold text-red-600">only {i.currentStock} left</span>}
                      </li>
                    ))}
                  </ul>
                  {order.orderRemarks && <p className="mt-2 text-xs italic text-gray-500">&ldquo;{order.orderRemarks}&rdquo;</p>}
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() => onLoad(order)}
                      className="flex-1 rounded-lg bg-emerald-600 py-2 text-sm font-semibold text-white hover:bg-emerald-700 btn-press"
                    >
                      Load to cart
                    </button>
                    <button
                      onClick={() => cancel(order)}
                      disabled={busyId === order.id}
                      className="flex items-center justify-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 btn-press"
                    >
                      {busyId === order.id && <Loader2 className="h-4 w-4 animate-spin" />}
                      Cancel
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
