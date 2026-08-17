"use client";

import { useEffect, useState } from "react";
import { X, Wallet, Clock } from "lucide-react";
import { peso, formatDateTime } from "@/lib/format";

interface ShiftReading {
  id: string;
  openedAt: string;
  startingCash: number;
  cashierName: string;
  salesCount: number;
  grossSales: number;
  discountAmount: number;
  taxAmount: number;
  netSales: number;
  paymentMethods: { method: string; salesCount: number; totalAmount: number }[];
  returnsCount: number;
  returnsAmount: number;
  voidedCount: number;
  cashSalesTotal: number;
  eWallet: {
    cashInCount: number;
    cashInTotal: number;
    cashOutCount: number;
    cashOutTotal: number;
    feesEarned: number;
    netCashImpact: number;
  };
  load: {
    count: number;
    total: number;
    feesEarned: number;
  };
  computedExpectedCash: number;
}

const METHOD_LABELS: Record<string, string> = {
  CASH: "Cash",
  CREDIT_CARD: "Credit Card",
  DEBIT_CARD: "Debit Card",
  INSURANCE: "Insurance",
  CHECK: "Check",
  SPLIT: "Split",
};

export default function ShiftModal({
  isOpen,
  onClose,
  onShiftChanged,
}: {
  isOpen: boolean;
  onClose: () => void;
  onShiftChanged: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [openShiftId, setOpenShiftId] = useState<string | null>(null);
  const [reading, setReading] = useState<ShiftReading | null>(null);
  const [suggestedStartingCash, setSuggestedStartingCash] = useState(0);
  const [lastClosedAt, setLastClosedAt] = useState<string | null>(null);

  const [startingCashInput, setStartingCashInput] = useState("");
  const [endingCashInput, setEndingCashInput] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [closedSummary, setClosedSummary] = useState<{ endingCash: number; expectedCash: number; variance: number } | null>(null);

  // showLoading is true when the modal first opens (expected, brief flash is
  // fine), but must be false after handleStart() succeeds — the user just
  // filled in a starting-cash amount and clicked "Start shift"; they should
  // see the shift reading appear, not the whole panel flash to "Loading...".
  const load = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setError(null);
    const res = await fetch("/api/shifts?mine=true");
    const data = await res.json();
    if (data.openShift) {
      setOpenShiftId(data.openShift.id);
      const readingRes = await fetch(`/api/shifts/${data.openShift.id}`);
      if (readingRes.ok) setReading(await readingRes.json());
    } else {
      setOpenShiftId(null);
      setReading(null);
      setSuggestedStartingCash(data.suggestedStartingCash ?? 0);
      setStartingCashInput(String(data.suggestedStartingCash ?? ""));
      setLastClosedAt(data.lastClosedAt ?? null);
    }
    if (showLoading) setLoading(false);
  };

  useEffect(() => {
    if (isOpen) {
      setClosedSummary(null);
      setEndingCashInput("");
      setNotes("");
      load();
    }
  }, [isOpen]);

  const handleStart = async () => {
    setError(null);
    const startingCash = parseFloat(startingCashInput);
    if (!Number.isFinite(startingCash) || startingCash < 0) {
      setError("Enter a valid starting cash amount.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/shifts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startingCash }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to start shift.");
        return;
      }
      onShiftChanged();
      await load(false);
    } finally {
      setBusy(false);
    }
  };

  const handleEnd = async () => {
    if (!openShiftId) return;
    setError(null);
    const endingCash = parseFloat(endingCashInput);
    if (!Number.isFinite(endingCash) || endingCash < 0) {
      setError("Enter a valid ending cash amount.");
      return;
    }
    if (!confirm("End your shift now? This can't be undone.")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/shifts/${openShiftId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endingCash, notes: notes.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to end shift.");
        return;
      }
      setClosedSummary({ endingCash: data.endingCash, expectedCash: data.expectedCash, variance: data.variance });
      onShiftChanged();
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
            <Wallet className="h-4 w-4 text-emerald-600" />
            <h2 className="text-base font-semibold">Shift</h2>
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <p className="text-sm text-gray-500">Loading...</p>
          ) : closedSummary ? (
            <div className="space-y-3 text-center">
              <p className="text-sm font-semibold text-gray-900">Shift ended</p>
              <div className="rounded-lg bg-gray-50 p-4 text-sm">
                <div className="flex justify-between"><span>Expected cash</span><span>{peso(closedSummary.expectedCash)}</span></div>
                <div className="flex justify-between"><span>Counted cash</span><span>{peso(closedSummary.endingCash)}</span></div>
                <div className={`mt-1 flex justify-between border-t pt-1 font-bold ${closedSummary.variance === 0 ? "text-gray-900" : closedSummary.variance > 0 ? "text-emerald-600" : "text-red-600"}`}>
                  <span>{closedSummary.variance === 0 ? "Balanced" : closedSummary.variance > 0 ? "Over" : "Short"}</span>
                  <span>{peso(Math.abs(closedSummary.variance))}</span>
                </div>
              </div>
              <p className="text-xs text-gray-500">Hand over {peso(closedSummary.endingCash)} to the next cashier.</p>
              <button onClick={onClose} className="w-full rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700">
                Done
              </button>
            </div>
          ) : !openShiftId ? (
            <div className="space-y-3">
              <p className="text-sm text-gray-600">Declare your starting cash float to begin your shift.</p>
              {lastClosedAt && (
                <p className="flex items-center gap-1.5 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-700">
                  <Clock className="h-3.5 w-3.5" />
                  Last shift closed {formatDateTime(lastClosedAt)} with {peso(suggestedStartingCash)} — pre-filled below.
                </p>
              )}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Starting cash</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">₱</span>
                  <input
                    type="text"
                    value={startingCashInput}
                    onChange={(e) => setStartingCashInput(e.target.value.replace(/[^\d.]/g, ""))}
                    className="w-full rounded-lg border border-gray-300 py-2 pl-8 pr-3 text-sm focus:border-emerald-500"
                  />
                </div>
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <button
                onClick={handleStart}
                disabled={busy}
                className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {busy ? "Starting..." : "Start shift"}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-lg bg-gray-50 p-3 text-sm">
                <div className="flex justify-between"><span className="text-gray-500">Started</span><span>{formatDateTime(reading?.openedAt ?? "")}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Starting cash</span><span>{peso(reading?.startingCash ?? 0)}</span></div>
              </div>

              <div>
                <p className="mb-2 text-sm font-semibold text-gray-900">Reading so far</p>
                <div className="space-y-1 rounded-lg bg-gray-50 p-3 text-sm">
                  <div className="flex justify-between"><span>Sales</span><span>{reading?.salesCount ?? 0}</span></div>
                  <div className="flex justify-between"><span>Gross sales</span><span>{peso(reading?.grossSales ?? 0)}</span></div>
                  <div className="flex justify-between"><span>Discounts</span><span>-{peso(reading?.discountAmount ?? 0)}</span></div>
                  <div className="flex justify-between font-medium"><span>Net sales</span><span>{peso(reading?.netSales ?? 0)}</span></div>
                  {(reading?.paymentMethods.length ?? 0) > 0 && (
                    <div className="mt-2 space-y-0.5 border-t pt-2 text-xs text-gray-500">
                      {reading?.paymentMethods.map((m) => (
                        <div key={m.method} className="flex justify-between">
                          <span>{METHOD_LABELS[m.method] ?? m.method} ({m.salesCount})</span>
                          <span>{peso(m.totalAmount)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {(reading?.returnsCount ?? 0) > 0 && (
                    <div className="flex justify-between text-xs text-amber-600"><span>Returns ({reading?.returnsCount})</span><span>{peso(reading?.returnsAmount ?? 0)}</span></div>
                  )}
                  {(reading?.voidedCount ?? 0) > 0 && (
                    <div className="flex justify-between text-xs text-gray-500"><span>Voided sales</span><span>{reading?.voidedCount}</span></div>
                  )}
                  {((reading?.eWallet.cashInCount ?? 0) > 0 || (reading?.eWallet.cashOutCount ?? 0) > 0) && (
                    <div className="mt-2 space-y-0.5 border-t pt-2 text-xs text-gray-500">
                      <p className="font-medium text-gray-700">E-wallet (GCash/Maya)</p>
                      {(reading?.eWallet.cashInCount ?? 0) > 0 && (
                        <div className="flex justify-between"><span>Cash in ({reading?.eWallet.cashInCount})</span><span>+{peso(reading?.eWallet.cashInTotal ?? 0)}</span></div>
                      )}
                      {(reading?.eWallet.cashOutCount ?? 0) > 0 && (
                        <div className="flex justify-between"><span>Cash out ({reading?.eWallet.cashOutCount})</span><span>-{peso(reading?.eWallet.cashOutTotal ?? 0)}</span></div>
                      )}
                      <div className="flex justify-between"><span>Fees earned</span><span>{peso(reading?.eWallet.feesEarned ?? 0)}</span></div>
                    </div>
                  )}
                  {(reading?.load.count ?? 0) > 0 && (
                    <div className="mt-2 space-y-0.5 border-t pt-2 text-xs text-gray-500">
                      <p className="font-medium text-gray-700">Prepaid load</p>
                      <div className="flex justify-between"><span>Load sold ({reading?.load.count})</span><span>+{peso(reading?.load.total ?? 0)}</span></div>
                      <div className="flex justify-between"><span>Fees earned</span><span>{peso(reading?.load.feesEarned ?? 0)}</span></div>
                    </div>
                  )}
                  <div className="flex justify-between border-t pt-1 font-semibold text-emerald-700"><span>Expected cash in drawer</span><span>{peso(reading?.computedExpectedCash ?? 0)}</span></div>
                </div>
              </div>

              <div className="border-t pt-3">
                <p className="mb-2 text-sm font-semibold text-gray-900">End shift</p>
                <label className="mb-1 block text-xs font-medium text-gray-700">Counted cash in drawer</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">₱</span>
                  <input
                    type="text"
                    value={endingCashInput}
                    onChange={(e) => setEndingCashInput(e.target.value.replace(/[^\d.]/g, ""))}
                    placeholder="0.00"
                    className="w-full rounded-lg border border-gray-300 py-2 pl-8 pr-3 text-sm focus:border-emerald-500"
                  />
                </div>
                <input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Notes (optional)"
                  className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500"
                />
                {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
                <button
                  onClick={handleEnd}
                  disabled={busy}
                  className="mt-3 w-full rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {busy ? "Ending..." : "End shift"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
