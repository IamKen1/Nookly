"use client";

import { useState } from "react";
import { ShoppingCart, Plus, Minus, Trash2, CreditCard, X } from "lucide-react";
import { peso } from "@/lib/format";

export interface CartLine {
  productId: string;
  name: string;
  strength?: string | null;
  dosageForm?: string | null;
  price: number;
  quantity: number;
  maxStock: number;
  isVatable: boolean;
  requiresPrescription: boolean;
}

interface CartPanelProps {
  cart: CartLine[];
  onUpdateQty: (productId: string, delta: number) => void;
  onSetQty: (productId: string, quantity: number) => void;
  onRemove: (productId: string) => void;
  onClear: () => void;
  onOpenCheckout: () => void;
  subtotal: number;
  vatableSales: number;
  vatAmount: number;
  nonVatableSales: number;
}

function QtyInput({
  quantity,
  maxStock,
  onCommit,
}: {
  quantity: number;
  maxStock: number;
  onCommit: (quantity: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);

  const commit = (raw: string) => {
    const parsed = Math.trunc(Number(raw));
    const clamped = Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, maxStock) : quantity;
    onCommit(clamped);
    setDraft(null);
  };

  return (
    <input
      type="number"
      min={1}
      max={maxStock}
      value={draft ?? quantity}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={(e) => commit(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit(e.currentTarget.value);
      }}
      onFocus={(e) => e.target.select()}
      className="w-12 rounded-md border border-gray-300 bg-white py-0.5 text-center text-xs font-bold text-gray-900 outline-none focus:border-emerald-500"
    />
  );
}

export default function CartPanel({
  cart,
  onUpdateQty,
  onSetQty,
  onRemove,
  onClear,
  onOpenCheckout,
  subtotal,
  vatableSales,
  vatAmount,
  nonVatableSales,
}: CartPanelProps) {
  const itemCount = cart.reduce((sum, l) => sum + l.quantity, 0);

  return (
    <div className="flex h-full min-h-0 flex-col border-l border-gray-200 bg-white">
      <div className="z-10 shrink-0 border-b border-gray-200 bg-white px-3 py-2.5 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-600">
            <ShoppingCart className="h-3.5 w-3.5 text-white" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-gray-900">Current Order</h2>
            <p className="text-[11px] text-gray-500">
              {cart.length} {cart.length === 1 ? "item" : "items"} in cart
            </p>
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {cart.length === 0 ? (
          <div className="flex flex-1 items-center justify-center p-4">
            <div className="text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
                <ShoppingCart className="h-6 w-6 text-gray-400" />
              </div>
              <h3 className="mb-1 text-sm font-semibold text-gray-900">Cart is empty</h3>
              <p className="text-xs text-gray-500">Add products to start building an order</p>
            </div>
          </div>
        ) : (
          <>
            <div className="flex-1 space-y-2 overflow-y-auto p-2.5">
              {cart.map((item) => {
                const details = [item.strength, item.dosageForm].filter(Boolean).join(" • ");
                return (
                  <div key={item.productId} className="rounded-lg bg-gray-50 p-2.5 transition-colors hover:bg-gray-100">
                    <div className="flex items-start gap-2.5">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-linear-to-br from-gray-200 to-gray-300">
                        <div className="text-sm font-bold text-gray-500">{item.name.charAt(0).toUpperCase()}</div>
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="mb-1.5 flex items-start justify-between">
                          <div className="min-w-0">
                            <h3 className="truncate text-xs font-semibold leading-tight text-gray-900">{item.name}</h3>
                            {details && <p className="truncate text-[11px] font-medium text-emerald-700">{details}</p>}
                            <p className="text-[11px] text-gray-500">{peso(item.price)} each</p>
                          </div>
                          <button
                            onClick={() => onRemove(item.productId)}
                            className="shrink-0 rounded-md p-1 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>

                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => onUpdateQty(item.productId, -1)}
                              className="flex h-6 w-6 items-center justify-center rounded-md border border-gray-300 bg-white text-gray-600 transition-colors hover:bg-gray-50"
                            >
                              <Minus className="h-3 w-3" />
                            </button>
                            <QtyInput
                              quantity={item.quantity}
                              maxStock={item.maxStock}
                              onCommit={(qty) => onSetQty(item.productId, qty)}
                            />
                            <button
                              onClick={() => onUpdateQty(item.productId, 1)}
                              disabled={item.quantity >= item.maxStock}
                              className="flex h-6 w-6 items-center justify-center rounded-md border border-gray-300 bg-white text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-40"
                            >
                              <Plus className="h-3 w-3" />
                            </button>
                          </div>

                          <div className="text-right">
                            <p className="text-xs font-bold text-gray-900">{peso(item.price * item.quantity)}</p>
                            {item.quantity >= item.maxStock && <p className="text-[10px] text-red-500">Max stock</p>}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="border-t border-gray-200 bg-white p-3">
              <div className="mb-3 space-y-1 text-xs text-gray-600">
                <div className="flex justify-between">
                  <span>Subtotal ({itemCount} items)</span>
                  <span>{peso(subtotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span>VAT Sales</span>
                  <span>{peso(vatableSales)}</span>
                </div>
                <div className="flex justify-between">
                  <span>12% VAT Sales</span>
                  <span>{peso(vatAmount)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Non-VAT Sales</span>
                  <span>{peso(nonVatableSales)}</span>
                </div>
                <div className="border-t border-gray-200 pt-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-gray-900">Total</span>
                    <span className="text-base font-bold text-emerald-600">{peso(subtotal)}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <button
                  onClick={onOpenCheckout}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-600 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-emerald-700"
                >
                  <CreditCard className="h-4 w-4" />
                  Checkout
                </button>
                <button
                  onClick={onClear}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-red-300 py-2 text-xs font-medium text-red-600 transition-colors hover:bg-red-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Clear All
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
