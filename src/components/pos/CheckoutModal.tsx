"use client";

import { useEffect, useState } from "react";
import { X, CreditCard, Calculator } from "lucide-react";
import { calculateVatInclusiveTotals, type DiscountType } from "@/lib/vat-calculations";
import { peso } from "@/lib/format";
import type { CartLine } from "./CartPanel";
import PrescriptionFields, { type PrescriptionDraft, type PrescriptionSelection } from "./PrescriptionFields";

export type { PrescriptionDraft };

interface PendingPrescription {
  id: string;
  prescriptionNumber: string;
  customer: { firstName: string; lastName: string };
}

interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  cart: CartLine[];
  needsPrescription: boolean;
  pendingPrescriptions: PendingPrescription[];
  onProcessSale: (payload: {
    paymentMethod: string;
    cashReceived?: number;
    discountType?: DiscountType;
    orderRemarks?: string;
    prescriptionId?: string;
    prescriptionDraft?: PrescriptionDraft;
  }) => Promise<{ ok: boolean; error?: string; saleNumber?: string; totalAmount?: number }>;
}

const DISCOUNTS: { value: DiscountType; label: string; percent: number }[] = [
  { value: "NONE", label: "None", percent: 0 },
  { value: "SENIOR", label: "Senior", percent: 20 },
  { value: "PWD", label: "PWD", percent: 20 },
  { value: "STUDENT", label: "Student", percent: 10 },
  { value: "EMPLOYEE", label: "Employee", percent: 15 },
];

const QUICK_AMOUNTS = [100, 200, 500, 1000];

export default function CheckoutModal({ isOpen, onClose, cart, needsPrescription, pendingPrescriptions, onProcessSale }: CheckoutModalProps) {
  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "CREDIT_CARD" | "DEBIT_CARD">("CASH");
  const [cashReceived, setCashReceived] = useState("");
  const [discountType, setDiscountType] = useState<DiscountType>("NONE");
  const [remarks, setRemarks] = useState("");
  const [prescriptionSelection, setPrescriptionSelection] = useState<PrescriptionSelection | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setPaymentMethod("CASH");
      setCashReceived("");
      setDiscountType("NONE");
      setRemarks("");
      setPrescriptionSelection(null);
      setIsProcessing(false);
      setError(null);
      setSuccess(null);
    }
  }, [isOpen]);

  const vatableTotal = cart.filter((i) => i.isVatable).reduce((sum, i) => sum + i.price * i.quantity, 0);
  const nonVatableTotal = cart.filter((i) => !i.isVatable).reduce((sum, i) => sum + i.price * i.quantity, 0);
  const discountPercent = DISCOUNTS.find((d) => d.value === discountType)?.percent ?? 0;

  const totals = calculateVatInclusiveTotals({ vatableTotal, nonVatableTotal, discountType, discountPercent });
  const finalTotal = totals.finalTotal;

  const cashAmount = parseFloat(cashReceived) || 0;
  const changeAmount = cashAmount - finalTotal;
  const isValidPayment = paymentMethod !== "CASH" || cashAmount >= finalTotal;

  const handleCashInput = (value: string) => {
    const sanitized = value.replace(/[^\d.]/g, "");
    const parts = sanitized.split(".");
    setCashReceived(parts.length > 2 ? `${parts[0]}.${parts[1]}` : sanitized);
  };

  const handleProcess = async () => {
    setError(null);
    if (!isValidPayment) {
      setError("Insufficient cash amount.");
      return;
    }
    if (needsPrescription && !prescriptionSelection) {
      setError("This cart contains a prescription-only item. Fill in the prescription details to continue.");
      return;
    }

    setIsProcessing(true);
    try {
      const result = await onProcessSale({
        paymentMethod,
        cashReceived: paymentMethod === "CASH" ? cashAmount : undefined,
        discountType: discountType !== "NONE" ? discountType : undefined,
        orderRemarks: remarks.trim() || undefined,
        ...(needsPrescription ? prescriptionSelection ?? {} : {}),
      });
      if (!result.ok) {
        setError(result.error ?? "Payment processing failed.");
        return;
      }
      setSuccess(`Sale ${result.saleNumber} completed — total ${peso(result.totalAmount ?? finalTotal)}`);
      setTimeout(() => onClose(), 1200);
    } catch {
      setError("Payment processing failed. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2">
      <div className="flex max-h-[90vh] w-full max-w-md flex-col rounded-lg bg-white sm:max-w-lg md:max-w-xl">
        <div className="flex shrink-0 items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-emerald-600" />
            <h2 className="text-base font-semibold">Checkout</h2>
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 transition-colors hover:text-gray-600">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <div>
            <h3 className="mb-2 text-sm font-semibold text-gray-900">Order Summary</h3>
            <div className="space-y-2 rounded-lg bg-gray-50 p-3">
              {cart.map((item) => (
                <div key={item.productId} className="flex justify-between text-sm">
                  <span className="mr-2 flex-1">
                    {item.quantity}x {item.name}
                  </span>
                  <span className="whitespace-nowrap font-medium">{peso(item.price * item.quantity)}</span>
                </div>
              ))}
              <div className="mt-3 space-y-1 border-t border-gray-200 pt-2">
                <div className="flex justify-between text-sm">
                  <span>Subtotal:</span>
                  <span>{peso(totals.subtotal)}</span>
                </div>
                {discountType !== "NONE" && (
                  <div className="flex justify-between text-sm font-medium text-green-600">
                    <span>
                      {discountType} ({discountPercent}%):
                    </span>
                    <span>-{peso(totals.discountAmount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span>Amount Due:</span>
                  <span>{peso(finalTotal)}</span>
                </div>
                <div className="mt-1 flex justify-between text-xs text-gray-500">
                  <span>VAT Sales:</span>
                  <span>{peso(totals.vatableSales)}</span>
                </div>
                <div className="flex justify-between text-xs text-gray-500">
                  <span>12% VAT Sales:</span>
                  <span>{peso(totals.vatAmount)}</span>
                </div>
                <div className="flex justify-between text-xs text-gray-500">
                  <span>Non-VAT Sales:</span>
                  <span>{peso(totals.nonVatableSales)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="font-semibold">Total:</span>
                  <span className="text-emerald-600">{peso(finalTotal)}</span>
                </div>
              </div>
            </div>
          </div>

          {needsPrescription && (
            <PrescriptionFields pendingPrescriptions={pendingPrescriptions} onChange={setPrescriptionSelection} />
          )}

          <div>
            <h3 className="mb-2 text-sm font-semibold text-gray-900">Order Notes</h3>
            <textarea
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="Special instructions, prescription details, delivery notes, etc..."
              className="h-20 w-full resize-none rounded-lg border border-gray-300 p-3 text-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500"
            />
            <p className="mt-1 text-xs text-gray-500">These notes will appear on the receipt</p>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold text-gray-900">Discounts</h3>
            <div className="grid grid-cols-3 gap-2">
              {DISCOUNTS.map((d) => (
                <button
                  key={d.value}
                  onClick={() => setDiscountType(d.value)}
                  className={`rounded-lg border p-2 text-xs font-medium transition-colors ${
                    discountType === d.value ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-gray-300 hover:border-gray-400"
                  }`}
                >
                  {d.label}
                  {d.percent > 0 && <div className="text-xs text-gray-500">{d.percent}%</div>}
                </button>
              ))}
            </div>
            {discountType !== "NONE" && (
              <div className="mt-3 rounded-lg border border-green-200 bg-green-50 p-3">
                <div className="text-sm font-medium text-green-800">
                  {discountType} Discount: {discountPercent}% (Save {peso(totals.discountAmount)})
                </div>
              </div>
            )}
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold text-gray-900">Payment Method</h3>
            <div className="grid grid-cols-3 gap-2">
              {(["CASH", "CREDIT_CARD", "DEBIT_CARD"] as const).map((method) => (
                <button
                  key={method}
                  onClick={() => setPaymentMethod(method)}
                  className={`rounded-lg border p-2 text-xs font-medium transition-colors ${
                    paymentMethod === method ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-gray-300 hover:border-gray-400"
                  }`}
                >
                  {method === "CASH" ? "Cash" : method === "CREDIT_CARD" ? "Credit" : "Debit"}
                </button>
              ))}
            </div>
          </div>

          {paymentMethod === "CASH" && (
            <div>
              <h3 className="mb-2 text-sm font-semibold text-gray-900">Cash Payment</h3>
              <div className="mb-4">
                <label className="mb-2 block text-sm font-medium text-gray-700">Cash Received</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 font-medium text-gray-400">₱</span>
                  <input
                    type="text"
                    value={cashReceived}
                    onChange={(e) => handleCashInput(e.target.value)}
                    placeholder="0.00"
                    className={`w-full rounded-lg border py-2 pl-8 pr-4 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 ${
                      cashReceived && !isValidPayment ? "border-red-500" : "border-gray-300"
                    }`}
                  />
                </div>
                {cashReceived && !isValidPayment && <p className="mt-1 text-sm text-red-600">Need {peso(finalTotal - cashAmount)} more</p>}
              </div>

              <div className="mb-4">
                <label className="mb-2 block text-sm font-medium text-gray-700">Quick Amount</label>
                <div className="grid grid-cols-5 gap-2">
                  <button
                    onClick={() => setCashReceived(finalTotal.toFixed(2))}
                    className="rounded-lg bg-green-100 p-2 text-xs font-medium text-green-700 transition-colors hover:bg-green-200 sm:text-sm"
                  >
                    Exact
                  </button>
                  {QUICK_AMOUNTS.map((amount) => (
                    <button
                      key={amount}
                      onClick={() => setCashReceived(String(amount))}
                      className="rounded-lg bg-gray-100 p-2 text-xs text-gray-700 transition-colors hover:bg-gray-200 sm:text-sm"
                    >
                      ₱{amount}
                    </button>
                  ))}
                </div>
              </div>

              {cashReceived && (
                <div className="rounded-lg bg-emerald-50 p-3">
                  <div className="mb-2 flex items-center gap-2">
                    <Calculator className="h-4 w-4 text-emerald-600" />
                    <span className="font-medium text-emerald-900">Change</span>
                  </div>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span>Cash:</span>
                      <span>{peso(cashAmount)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Total:</span>
                      <span>{peso(finalTotal)}</span>
                    </div>
                    <div className="flex justify-between border-t border-emerald-200 pt-1 text-base font-bold">
                      <span>Change:</span>
                      <span className={changeAmount >= 0 ? "text-green-600" : "text-red-600"}>{peso(changeAmount)}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}
          {success && <p className="text-sm font-medium text-emerald-600">{success}</p>}
        </div>

        <div className="flex shrink-0 flex-col items-stretch justify-end gap-2 border-t bg-gray-50 p-4 sm:flex-row sm:items-center sm:gap-3 sm:p-6">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleProcess}
            disabled={isProcessing || !isValidPayment || Boolean(success)}
            className="flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isProcessing ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Processing...
              </>
            ) : (
              <>
                <CreditCard className="h-4 w-4" />
                Complete Sale
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
