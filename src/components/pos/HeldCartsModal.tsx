"use client";

import { useState } from "react";
import { Loader2, PauseCircle, Trash2, X } from "lucide-react";
import { peso } from "@/lib/format";

export interface HeldCart {
  id: string;
  label: string | null;
  createdAt: string;
  heldBy: string;
  items: {
    productId: string;
    name: string;
    strength: string | null;
    dosageForm: string | null;
    price: number;
    quantity: number;
    currentStock: number;
    isVatable: boolean;
    requiresPrescription: boolean;
  }[];
}

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" });

// Carts put on hold at this branch, oldest first. Load one back into the
// cart, or remove it if the customer left.
export default function HeldCartsModal({
  carts,
  onClose,
  onLoad,
  onRemove,
}: {
  carts: HeldCart[];
  onClose: () => void;
  onLoad: (cart: HeldCart) => Promise<void> | void;
  onRemove: (cart: HeldCart) => Promise<void>;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div className="flex items-center gap-2">
            <PauseCircle className="h-5 w-5 text-emerald-600" />
            <h2 className="text-base font-bold text-gray-900">Carts on hold</h2>
            {carts.length > 0 && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">{carts.length}</span>}
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        {carts.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-gray-500">No carts on hold. Use Hold in the cart to set one aside.</p>
        ) : (
          <ul className="min-h-0 flex-1 divide-y divide-gray-100 overflow-y-auto">
            {carts.map((c) => {
              const total = c.items.reduce((s, i) => s + i.price * i.quantity, 0);
              const units = c.items.reduce((s, i) => s + i.quantity, 0);
              return (
                <li key={c.id} className="px-5 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-gray-900">{c.label || "No name"}</p>
                      <p className="text-xs text-gray-500">
                        {timeOf(c.createdAt)} · {c.heldBy} · {units} item{units === 1 ? "" : "s"}
                      </p>
                      <p className="mt-1 truncate text-xs text-gray-400">{c.items.map((i) => `${i.quantity}× ${i.name}`).join(", ")}</p>
                    </div>
                    <p className="shrink-0 text-sm font-bold tabular-nums text-gray-900">{peso(total)}</p>
                  </div>
                  <div className="mt-2 flex gap-2">
                    <button
                      onClick={async () => {
                        setBusyId(c.id);
                        await onLoad(c);
                        setBusyId(null);
                      }}
                      disabled={busyId !== null}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {busyId === c.id && <Loader2 className="h-4 w-4 animate-spin" />}
                      Load to cart
                    </button>
                    <button
                      onClick={async () => {
                        if (!confirm(`Remove the held cart${c.label ? ` for ${c.label}` : ""}?`)) return;
                        setBusyId(c.id);
                        await onRemove(c);
                        setBusyId(null);
                      }}
                      disabled={busyId !== null}
                      className="rounded-lg border border-red-200 px-3 text-red-600 hover:bg-red-50 disabled:opacity-50"
                      aria-label="Remove held cart"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
