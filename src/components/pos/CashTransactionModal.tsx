"use client";

import { useEffect, useState } from "react";
import { X, Banknote } from "lucide-react";
import { peso, formatDateTime } from "@/lib/format";

interface CashTxn {
  id: string;
  type: "CASH_IN" | "CASH_OUT";
  provider: string;
  amount: number;
  serviceFee: number;
  referenceNumber: string | null;
  createdAt: string;
}

const PROVIDERS = ["GCash", "Maya", "PadalaXpress", "Other"];

export default function CashTransactionModal({
  isOpen,
  onClose,
  shiftId,
  onLogged,
}: {
  isOpen: boolean;
  onClose: () => void;
  shiftId: string | null;
  onLogged: () => void;
}) {
  const [type, setType] = useState<"CASH_IN" | "CASH_OUT">("CASH_IN");
  const [provider, setProvider] = useState("GCash");
  const [amount, setAmount] = useState("");
  const [serviceFee, setServiceFee] = useState("");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<CashTxn[]>([]);

  const loadRecent = () => {
    if (!shiftId) return;
    fetch(`/api/cash-transactions?shiftId=${shiftId}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setRecent(Array.isArray(data) ? data.slice(0, 5) : []))
      .catch(() => setRecent([]));
  };

  useEffect(() => {
    if (isOpen) {
      setType("CASH_IN");
      setProvider("GCash");
      setAmount("");
      setServiceFee("");
      setReferenceNumber("");
      setCustomerName("");
      setError(null);
      loadRecent();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, shiftId]);

  const submit = async () => {
    setError(null);
    const amt = parseFloat(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setError("Enter a valid amount.");
      return;
    }
    const fee = parseFloat(serviceFee) || 0;
    setBusy(true);
    try {
      const res = await fetch("/api/cash-transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          provider,
          amount: amt,
          serviceFee: fee,
          referenceNumber: referenceNumber.trim() || undefined,
          customerName: customerName.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to log transaction.");
        return;
      }
      setAmount("");
      setServiceFee("");
      setReferenceNumber("");
      setCustomerName("");
      onLogged();
      loadRecent();
    } finally {
      setBusy(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2">
      <div className="flex max-h-[90vh] w-full max-w-md flex-col rounded-lg bg-white sm:max-w-lg">
        <div className="flex shrink-0 items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <Banknote className="h-4 w-4 text-emerald-600" />
            <h2 className="text-base font-semibold">E-wallet cash in / cash out</h2>
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {!shiftId && (
            <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
              No open shift — this will still be logged, but start a shift so it's included in your cash handover.
            </p>
          )}

          <div className="mb-3 grid grid-cols-2 gap-2">
            <button
              onClick={() => setType("CASH_IN")}
              className={`rounded-lg border p-2 text-sm font-medium ${type === "CASH_IN" ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-gray-300"}`}
            >
              Cash In
              <div className="text-xs text-gray-500">Customer loads e-wallet</div>
            </button>
            <button
              onClick={() => setType("CASH_OUT")}
              className={`rounded-lg border p-2 text-sm font-medium ${type === "CASH_OUT" ? "border-red-500 bg-red-50 text-red-700" : "border-gray-300"}`}
            >
              Cash Out
              <div className="text-xs text-gray-500">Customer withdraws cash</div>
            </button>
          </div>

          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Provider</label>
              <select value={provider} onChange={(e) => setProvider(e.target.value)} className="w-full rounded-lg border border-gray-300 p-2 text-sm">
                {PROVIDERS.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">Amount</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">₱</span>
                  <input
                    type="text"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
                    placeholder="0.00"
                    className="w-full rounded-lg border border-gray-300 py-2 pl-8 pr-3 text-sm focus:border-emerald-500"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">Service fee</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">₱</span>
                  <input
                    type="text"
                    value={serviceFee}
                    onChange={(e) => setServiceFee(e.target.value.replace(/[^\d.]/g, ""))}
                    placeholder="0.00"
                    className="w-full rounded-lg border border-gray-300 py-2 pl-8 pr-3 text-sm focus:border-emerald-500"
                  />
                </div>
              </div>
            </div>
            <input
              value={referenceNumber}
              onChange={(e) => setReferenceNumber(e.target.value)}
              placeholder="Reference number (optional)"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500"
            />
            <input
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Customer name (optional)"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500"
            />

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button
              onClick={submit}
              disabled={busy}
              className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {busy ? "Logging..." : `Log ${type === "CASH_IN" ? "cash in" : "cash out"}`}
            </button>
          </div>

          {recent.length > 0 && (
            <div className="mt-4 border-t pt-3">
              <p className="mb-2 text-xs font-semibold text-gray-700">This shift</p>
              <div className="space-y-1.5">
                {recent.map((t) => (
                  <div key={t.id} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-xs">
                    <div>
                      <span className={`font-semibold ${t.type === "CASH_IN" ? "text-emerald-700" : "text-red-700"}`}>
                        {t.type === "CASH_IN" ? "Cash In" : "Cash Out"}
                      </span>
                      <span className="ml-1.5 text-gray-500">{t.provider}</span>
                    </div>
                    <div className="text-right">
                      <p className="font-medium text-gray-900">{peso(t.amount)}</p>
                      <p className="text-gray-400">{formatDateTime(t.createdAt)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
