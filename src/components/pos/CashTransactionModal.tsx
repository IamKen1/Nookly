"use client";

import { useEffect, useState } from "react";
import { X, Banknote, Loader2, History } from "lucide-react";
import { peso, formatDateTime } from "@/lib/format";

interface CashTxn {
  id: string;
  type: "CASH_IN" | "CASH_OUT" | "LOAD";
  provider: string;
  amount: number;
  serviceFee: number;
  referenceNumber: string | null;
  customerMobile: string | null;
  createdAt: string;
}

const MOBILE_LABEL: Record<CashTxn["type"], string> = {
  CASH_IN: "Customer's mobile number (optional — recommended in case of disputes)",
  CASH_OUT: "Customer's mobile number (optional — recommended in case of disputes)",
  LOAD: "Mobile number to load",
};

const WALLET_PROVIDERS = ["GCash", "Maya", "PadalaXpress", "Other"];
const LOAD_NETWORKS = ["Globe", "Smart", "TNT", "TM", "DITO", "Other"];

const TYPE_LABELS: Record<CashTxn["type"], string> = {
  CASH_IN: "Cash In",
  CASH_OUT: "Cash Out",
  LOAD: "Load",
};

const TYPE_DOT: Record<CashTxn["type"], string> = {
  CASH_IN: "bg-emerald-500",
  CASH_OUT: "bg-red-500",
  LOAD: "bg-blue-500",
};

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
  const [type, setType] = useState<CashTxn["type"]>("CASH_IN");
  const [provider, setProvider] = useState("GCash");
  const [amount, setAmount] = useState("");
  const [serviceFee, setServiceFee] = useState("");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerMobile, setCustomerMobile] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<CashTxn[]>([]);

  const providerOptions = type === "LOAD" ? LOAD_NETWORKS : WALLET_PROVIDERS;

  const handleTypeChange = (nextType: CashTxn["type"]) => {
    setType(nextType);
    setProvider(nextType === "LOAD" ? LOAD_NETWORKS[0] : WALLET_PROVIDERS[0]);
  };

  const loadRecent = () => {
    if (!shiftId) return;
    fetch(`/api/cash-transactions?shiftId=${shiftId}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setRecent(Array.isArray(data) ? data.slice(0, 20) : []))
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
      setCustomerMobile("");
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
    if (type === "LOAD" && !customerMobile.trim()) {
      setError("Enter the mobile number to load.");
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
          customerMobile: customerMobile.trim() || undefined,
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
      setCustomerMobile("");
      onLogged();
      loadRecent();
    } finally {
      setBusy(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2">
      <div className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <Banknote className="h-4 w-4" />
            </span>
            <h2 className="text-base font-semibold text-gray-900">E-wallet &amp; load services</h2>
          </div>
          <button onClick={onClose} className="btn-press rounded-lg p-1.5 text-gray-400 hover:bg-gray-50 hover:text-gray-600">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[1fr_280px]">
          <div className="min-h-0 overflow-y-auto p-5">
            {!shiftId && (
              <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                No open shift — this will still be logged, but start a shift so it&apos;s included in your cash handover.
              </p>
            )}

            <div className="mb-4 grid grid-cols-3 gap-2">
              <button
                onClick={() => handleTypeChange("CASH_IN")}
                className={`btn-press rounded-xl border p-3 text-left text-sm font-medium transition-colors ${
                  type === "CASH_IN" ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-gray-200 hover:border-gray-300"
                }`}
              >
                Cash In
                <div className="mt-0.5 text-xs font-normal text-gray-500">Customer loads e-wallet</div>
              </button>
              <button
                onClick={() => handleTypeChange("CASH_OUT")}
                className={`btn-press rounded-xl border p-3 text-left text-sm font-medium transition-colors ${
                  type === "CASH_OUT" ? "border-red-500 bg-red-50 text-red-700" : "border-gray-200 hover:border-gray-300"
                }`}
              >
                Cash Out
                <div className="mt-0.5 text-xs font-normal text-gray-500">Customer withdraws cash</div>
              </button>
              <button
                onClick={() => handleTypeChange("LOAD")}
                className={`btn-press rounded-xl border p-3 text-left text-sm font-medium transition-colors ${
                  type === "LOAD" ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 hover:border-gray-300"
                }`}
              >
                Load
                <div className="mt-0.5 text-xs font-normal text-gray-500">Prepaid mobile load</div>
              </button>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">{type === "LOAD" ? "Network" : "Provider"}</label>
                  <select
                    value={provider}
                    onChange={(e) => setProvider(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 p-2 text-sm focus:border-emerald-500"
                  >
                    {providerOptions.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
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
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">{MOBILE_LABEL[type]}</label>
                <input
                  required={type === "LOAD"}
                  value={customerMobile}
                  onChange={(e) => setCustomerMobile(e.target.value.replace(/[^\d]/g, ""))}
                  placeholder="09171234567"
                  inputMode="numeric"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
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
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">Reference number</label>
                  <input
                    value={referenceNumber}
                    onChange={(e) => setReferenceNumber(e.target.value)}
                    placeholder="Optional"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">Customer name</label>
                <input
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Optional"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500"
                />
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}

              <button
                onClick={submit}
                disabled={busy}
                className="btn-press flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                {busy ? "Logging..." : `Log ${TYPE_LABELS[type].toLowerCase()}`}
              </button>
            </div>
          </div>

          <div className="flex min-h-0 flex-col border-t border-gray-100 bg-gray-50 md:border-l md:border-t-0">
            <div className="flex shrink-0 items-center gap-1.5 border-b border-gray-100 px-4 py-3">
              <History className="h-3.5 w-3.5 text-gray-400" />
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">This shift</p>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {recent.length === 0 ? (
                <p className="px-1 py-4 text-center text-xs text-gray-400">No transactions logged yet.</p>
              ) : (
                <div className="space-y-2">
                  {recent.map((t) => (
                    <div key={t.id} className="rounded-lg bg-white p-2.5 text-xs shadow-sm ring-1 ring-gray-100">
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1.5 font-semibold text-gray-800">
                          <span className={`h-1.5 w-1.5 rounded-full ${TYPE_DOT[t.type]}`} />
                          {TYPE_LABELS[t.type]}
                        </span>
                        <span className="font-semibold text-gray-900">{peso(t.amount)}</span>
                      </div>
                      <div className="mt-1 flex items-center justify-between text-gray-400">
                        <span>
                          {t.provider}
                          {t.customerMobile && ` · ${t.customerMobile}`}
                        </span>
                      </div>
                      <p className="mt-0.5 text-gray-400">{formatDateTime(t.createdAt)}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
