"use client";

import { Fragment, useState } from "react";
import { useRouter } from "next/navigation";
import { Ban, ChevronDown, ChevronUp, Printer, RotateCcw, X } from "lucide-react";
import { printReceipt } from "@/lib/receipt";
import type { ReceiptData } from "@/types/receipt";

interface SaleItem {
  id: string;
  name: string;
  quantity: number;
  returnedQuantity: number;
  unitPrice: number;
  totalPrice: number;
}

interface Sale {
  id: string;
  saleNumber: string;
  totalAmount: number;
  paymentMethod: string;
  discountType: string | null;
  status: string;
  isReturnRecord: boolean;
  saleDate: string;
  cashierName: string;
  itemCount: number;
  items: SaleItem[];
}

const peso = (value: number) => `₱${value.toLocaleString("en-PH", { minimumFractionDigits: 2 })}`;

export default function SalesClient({ sales: initialSales, canVoid }: { sales: Sale[]; canVoid: boolean }) {
  const router = useRouter();
  const [sales, setSales] = useState(initialSales);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [printingId, setPrintingId] = useState<string | null>(null);
  const [voidingId, setVoidingId] = useState<string | null>(null);

  const [returnTarget, setReturnTarget] = useState<Sale | null>(null);
  const [returnQtys, setReturnQtys] = useState<Record<string, string>>({});
  const [returnReason, setReturnReason] = useState("");
  const [returnError, setReturnError] = useState<string | null>(null);
  const [returning, setReturning] = useState(false);

  const handleVoid = async (saleId: string) => {
    const reason = prompt("Reason for voiding this sale (optional):") ?? undefined;
    if (!confirm("Void this sale? Stock will be returned to inventory.")) return;
    setVoidingId(saleId);
    try {
      const res = await fetch(`/api/sales/${saleId}/void`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error ?? "Failed to void sale.");
        return;
      }
      setSales((prev) => prev.map((s) => (s.id === saleId ? { ...s, status: "CANCELLED" } : s)));
    } catch {
      alert("Network error.");
    } finally {
      setVoidingId(null);
    }
  };

  const openReturn = (sale: Sale) => {
    setReturnTarget(sale);
    setReturnQtys({});
    setReturnReason("");
    setReturnError(null);
  };

  const submitReturn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!returnTarget) return;
    setReturnError(null);

    const items = Object.entries(returnQtys)
      .map(([saleItemId, qty]) => ({ saleItemId, quantity: parseInt(qty, 10) || 0 }))
      .filter((i) => i.quantity > 0);

    if (items.length === 0) {
      setReturnError("Enter a quantity for at least one item.");
      return;
    }

    setReturning(true);
    try {
      const res = await fetch(`/api/sales/${returnTarget.id}/return`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items, reason: returnReason || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setReturnError(data.error ?? "Failed to process return.");
        return;
      }
      setReturnTarget(null);
      router.refresh();
    } catch {
      setReturnError("Network error.");
    } finally {
      setReturning(false);
    }
  };

  const handlePrint = async (saleId: string) => {
    setPrintingId(saleId);
    try {
      const res = await fetch(`/api/sales/${saleId}/receipt`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const receiptData: ReceiptData = { ...data, date: new Date(data.date) };
      printReceipt(receiptData);
    } catch {
      alert("Failed to load receipt.");
    } finally {
      setPrintingId(null);
    }
  };

  const todayTotal = sales
    .filter((s) => s.status === "COMPLETED" && new Date(s.saleDate).toDateString() === new Date().toDateString())
    .reduce((sum, s) => sum + s.totalAmount, 0);

  const canReturnSale = (s: Sale) =>
    canVoid && !s.isReturnRecord && s.status !== "CANCELLED" && s.items.some((i) => i.quantity - i.returnedQuantity > 0);

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-zinc-900">Sales</h1>
        <div className="rounded-2xl border border-zinc-200 bg-white px-5 py-3 text-right">
          <p className="text-xs text-zinc-500">Today&apos;s total</p>
          <p className="text-lg font-bold text-emerald-700">{peso(todayTotal)}</p>
        </div>
      </div>

      <div className="mt-6 overflow-hidden rounded-2xl border border-zinc-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-100 text-left text-xs font-medium uppercase text-zinc-400">
              <th className="px-4 py-3">OR #</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Cashier</th>
              <th className="px-4 py-3">Items</th>
              <th className="px-4 py-3">Total</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {sales.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-zinc-400">
                  No sales yet — head to the POS to make your first sale.
                </td>
              </tr>
            ) : (
              sales.map((s) => (
                <Fragment key={s.id}>
                  <tr
                    onClick={() => setExpanded(expanded === s.id ? null : s.id)}
                    className="cursor-pointer border-b border-zinc-50 last:border-0 hover:bg-zinc-50"
                  >
                    <td className="px-4 py-3 font-medium text-zinc-900">
                      {s.saleNumber}
                      {s.isReturnRecord && <span className="ml-2 text-xs font-normal text-zinc-400">(return)</span>}
                    </td>
                    <td className="px-4 py-3 text-zinc-600">
                      {new Date(s.saleDate).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" })}
                    </td>
                    <td className="px-4 py-3 text-zinc-600">{s.cashierName}</td>
                    <td className="px-4 py-3 text-zinc-600">{s.itemCount}</td>
                    <td className={`px-4 py-3 font-medium ${s.totalAmount < 0 ? "text-red-600" : "text-zinc-900"}`}>{peso(s.totalAmount)}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                          s.status === "COMPLETED" ? "bg-emerald-100 text-emerald-700" : "bg-zinc-100 text-zinc-500"
                        }`}
                      >
                        {s.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-3">
                        {canReturnSale(s) && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openReturn(s);
                            }}
                            className="text-zinc-400 hover:text-amber-600"
                            title="Return item(s)"
                          >
                            <RotateCcw className="h-4 w-4" />
                          </button>
                        )}
                        {canVoid && s.status === "COMPLETED" && !s.isReturnRecord && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleVoid(s.id);
                            }}
                            disabled={voidingId === s.id}
                            className="text-zinc-400 hover:text-red-600 disabled:opacity-50"
                            title="Void sale (same-day only)"
                          >
                            <Ban className="h-4 w-4" />
                          </button>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handlePrint(s.id);
                          }}
                          disabled={printingId === s.id}
                          className="text-zinc-400 hover:text-emerald-600 disabled:opacity-50"
                          title="Print receipt"
                        >
                          <Printer className="h-4 w-4" />
                        </button>
                        {expanded === s.id ? <ChevronUp className="h-4 w-4 text-zinc-400" /> : <ChevronDown className="h-4 w-4 text-zinc-400" />}
                      </div>
                    </td>
                  </tr>
                  {expanded === s.id && (
                    <tr key={`${s.id}-detail`}>
                      <td colSpan={7} className="bg-zinc-50 px-6 py-4">
                        <div className="space-y-1 text-sm">
                          {s.items.map((item) => (
                            <div key={item.id} className="flex justify-between text-zinc-600">
                              <span>
                                {item.name} × {item.quantity}
                                {item.returnedQuantity > 0 && (
                                  <span className="ml-2 text-xs text-amber-600">({item.returnedQuantity} returned)</span>
                                )}
                              </span>
                              <span>{peso(item.totalPrice)}</span>
                            </div>
                          ))}
                          <div className="flex justify-between border-t border-zinc-200 pt-1 text-xs text-zinc-400">
                            <span>Payment: {s.paymentMethod}</span>
                            {s.discountType && s.discountType !== "NONE" && <span>Discount: {s.discountType}</span>}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>

      {returnTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-zinc-900">Return items — {returnTarget.saleNumber}</h2>
              <button onClick={() => setReturnTarget(null)}>
                <X className="h-5 w-5 text-zinc-400" />
              </button>
            </div>
            <p className="mt-1 text-sm text-zinc-500">
              Creates a linked return receipt and restocks only the items you return. The original sale stays on record.
            </p>

            <form onSubmit={submitReturn} className="mt-4 space-y-3">
              <div className="max-h-64 space-y-2 overflow-y-auto">
                {returnTarget.items.map((item) => {
                  const remaining = item.quantity - item.returnedQuantity;
                  if (remaining <= 0) return null;
                  return (
                    <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 px-3 py-2">
                      <div>
                        <p className="text-sm font-medium text-zinc-900">{item.name}</p>
                        <p className="text-xs text-zinc-500">{remaining} available to return</p>
                      </div>
                      <input
                        type="number"
                        min={0}
                        max={remaining}
                        placeholder="0"
                        value={returnQtys[item.id] ?? ""}
                        onChange={(e) => setReturnQtys({ ...returnQtys, [item.id]: e.target.value })}
                        className="w-20 rounded-lg border border-zinc-300 px-2 py-1.5 text-sm"
                      />
                    </div>
                  );
                })}
              </div>
              <input
                placeholder="Reason (optional)"
                value={returnReason}
                onChange={(e) => setReturnReason(e.target.value)}
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
              />
              {returnError && <p className="text-sm text-red-600">{returnError}</p>}
              <button
                type="submit"
                disabled={returning}
                className="w-full rounded-full bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
              >
                {returning ? "Processing..." : "Process return"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
