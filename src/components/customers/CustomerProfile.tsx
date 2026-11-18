"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Gift, Loader2, X } from "lucide-react";
import { formatDate, formatDateTime, peso } from "@/lib/format";

interface Customer {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  dateOfBirth: string | null;
  isActive: boolean;
  loyaltyPoints: number;
  createdAt: string;
}

interface SaleRow {
  id: string;
  saleNumber: string;
  saleDate: string;
  status: string;
  isReturn: boolean;
  totalAmount: number;
  pointsRedeemed: number;
  pointsEarned: number;
  itemCount: number;
  branch: string;
}

interface LedgerRow {
  id: string;
  type: "EARN" | "REDEEM" | "RETURN" | "VOID" | "ADJUST";
  points: number;
  balanceAfter: number;
  reason: string | null;
  createdAt: string;
  saleNumber: string | null;
  by: string;
}

const TYPE_LABEL: Record<LedgerRow["type"], string> = {
  EARN: "Earned",
  REDEEM: "Used",
  RETURN: "Return",
  VOID: "Voided sale",
  ADJUST: "Adjusted",
};

const card = "rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm";
const input = "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20";

export default function CustomerProfile({
  customer,
  stats,
  sales,
  ledger,
  prescriptions,
  showPoints,
  canAdjust,
  canSeeSales,
  pesoValuePerPoint,
}: {
  customer: Customer;
  stats: { totalSpent: number; purchases: number };
  sales: SaleRow[];
  ledger: LedgerRow[];
  prescriptions: { id: string; number: string; writtenDate: string; status: string }[];
  showPoints: boolean;
  canAdjust: boolean;
  canSeeSales: boolean;
  pesoValuePerPoint: number;
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    firstName: customer.firstName,
    lastName: customer.lastName,
    phone: customer.phone ?? "",
    email: customer.email ?? "",
    address: customer.address ?? "",
    city: customer.city ?? "",
    dateOfBirth: customer.dateOfBirth ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adjusting, setAdjusting] = useState(false);
  const [tab, setTab] = useState<"purchases" | "points" | "prescriptions">("purchases");

  const patch = async (body: Record<string, unknown>) => {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const res = await fetch(`/api/customers/${customer.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to save.");
        return false;
      }
      setSaved(true);
      router.refresh();
      return true;
    } catch {
      setError("Network error.");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const field = (key: keyof typeof form, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="block text-sm">
      <span className="mb-1 block text-xs font-medium text-zinc-600">{label}</span>
      <input
        value={form[key]}
        onChange={(e) => {
          setForm({ ...form, [key]: e.target.value });
          setSaved(false);
        }}
        className={input}
        {...props}
      />
    </label>
  );

  return (
    <div className="mx-auto w-full max-w-6xl">
      <Link href="/customers" className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-emerald-700">
        <ArrowLeft className="h-4 w-4" /> Customers
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">
            {customer.firstName} {customer.lastName}
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Customer since {formatDate(customer.createdAt)}
            {!customer.isActive && <span className="ml-2 rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-zinc-600">Deactivated</span>}
          </p>
        </div>
      </div>

      <div className={`mt-6 grid gap-4 ${showPoints ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
        {showPoints && (
          <div className={`${card} flex items-start justify-between gap-3`}>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Points</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-violet-700">{customer.loyaltyPoints.toLocaleString("en-PH")}</p>
              <p className="text-xs text-zinc-500">worth {peso(customer.loyaltyPoints * pesoValuePerPoint)}</p>
            </div>
            {canAdjust && (
              <button onClick={() => setAdjusting(true)} className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-700 hover:bg-violet-100">
                Adjust
              </button>
            )}
          </div>
        )}
        <div className={card}>
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Total spent</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-zinc-900">{peso(stats.totalSpent)}</p>
          <p className="text-xs text-zinc-500">after returns</p>
        </div>
        <div className={card}>
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Purchases</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-zinc-900">{stats.purchases.toLocaleString("en-PH")}</p>
          <p className="text-xs text-zinc-500">{sales.find((s) => !s.isReturn && s.status !== "CANCELLED") ? `last on ${formatDate(sales.find((s) => !s.isReturn && s.status !== "CANCELLED")!.saleDate)}` : "none yet"}</p>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[22rem_1fr]">
        <form
          className={`${card} h-fit space-y-3`}
          onSubmit={(e) => {
            e.preventDefault();
            patch(form);
          }}
        >
          <h2 className="text-base font-semibold text-zinc-900">Details</h2>
          <div className="grid grid-cols-2 gap-3">
            {field("firstName", "First name")}
            {field("lastName", "Last name")}
          </div>
          {field("phone", "Mobile number", { inputMode: "tel" })}
          {field("email", "Email", { type: "email" })}
          {field("address", "Address")}
          {field("city", "City")}
          {field("dateOfBirth", "Birthday", { type: "date" })}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex items-center justify-between gap-2 pt-1">
            <button
              type="button"
              disabled={saving}
              onClick={() => {
                if (customer.isActive && !confirm("Deactivate this customer? They won't show up at checkout. Their sales and points are kept.")) return;
                patch({ isActive: !customer.isActive });
              }}
              className="text-xs font-medium text-zinc-500 hover:text-red-600"
            >
              {customer.isActive ? "Deactivate" : "Reactivate"}
            </button>
            <div className="flex items-center gap-2">
              {saved && <span className="text-xs text-emerald-600">Saved.</span>}
              <button type="submit" disabled={saving} className="flex items-center gap-2 rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-60">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Save
              </button>
            </div>
          </div>
        </form>

        <div className={`${card} min-w-0`}>
          <div className="flex gap-1 border-b border-zinc-200">
            {([
              ["purchases", `Purchases (${sales.length}${sales.length === 50 ? "+" : ""})`],
              ...(showPoints ? [["points", "Points history"]] : []),
              ["prescriptions", `Prescriptions (${prescriptions.length})`],
            ] as [typeof tab, string][]).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${tab === key ? "border-emerald-600 text-emerald-700" : "border-transparent text-zinc-500 hover:text-zinc-700"}`}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === "purchases" && (
            <div className="overflow-x-auto">
              <table className="mt-2 w-full min-w-[34rem] text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-zinc-500">
                  <tr>
                    <th className="py-2 pr-3">Date</th>
                    <th className="py-2 pr-3">Receipt</th>
                    <th className="py-2 pr-3">Items</th>
                    {showPoints && <th className="py-2 pr-3 text-right">Points</th>}
                    <th className="py-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {sales.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-zinc-400">No purchases yet.</td>
                    </tr>
                  ) : (
                    sales.map((s) => (
                      <tr key={s.id} className={s.status === "CANCELLED" ? "text-zinc-400 line-through" : ""}>
                        <td className="py-2 pr-3 whitespace-nowrap">{formatDateTime(s.saleDate)}</td>
                        <td className="py-2 pr-3 whitespace-nowrap">
                          {canSeeSales ? (
                            <Link href={`/sales?search=${encodeURIComponent(s.saleNumber)}`} className="font-medium text-emerald-700 hover:underline">
                              {s.saleNumber}
                            </Link>
                          ) : (
                            s.saleNumber
                          )}
                          {s.isReturn && <span className="ml-1 text-xs text-amber-600">return</span>}
                          {s.status === "CANCELLED" && <span className="ml-1 text-xs no-underline">voided</span>}
                        </td>
                        <td className="py-2 pr-3">{s.itemCount}</td>
                        {showPoints && (
                          <td className="py-2 pr-3 text-right text-xs tabular-nums">
                            {s.pointsEarned > 0 && <span className="text-emerald-700">+{s.pointsEarned}</span>}
                            {s.pointsRedeemed > 0 && <span className="ml-1 text-violet-700">−{s.pointsRedeemed}</span>}
                          </td>
                        )}
                        <td className="py-2 text-right tabular-nums">{peso(s.totalAmount)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {tab === "points" && showPoints && (
            <div className="overflow-x-auto">
              <table className="mt-2 w-full min-w-[34rem] text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-zinc-500">
                  <tr>
                    <th className="py-2 pr-3">Date</th>
                    <th className="py-2 pr-3">What</th>
                    <th className="py-2 pr-3 text-right">Points</th>
                    <th className="py-2 text-right">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {ledger.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-zinc-400">No points yet.</td>
                    </tr>
                  ) : (
                    ledger.map((t) => (
                      <tr key={t.id}>
                        <td className="py-2 pr-3 whitespace-nowrap">{formatDateTime(t.createdAt)}</td>
                        <td className="py-2 pr-3">
                          <span className="font-medium text-zinc-800">{TYPE_LABEL[t.type]}</span>
                          {t.saleNumber && <span className="ml-1 text-zinc-500">· {t.saleNumber}</span>}
                          {t.type === "ADJUST" && t.reason && <span className="block text-xs text-zinc-500">{t.reason} — {t.by}</span>}
                        </td>
                        <td className={`py-2 pr-3 text-right font-semibold tabular-nums ${t.points > 0 ? "text-emerald-700" : "text-violet-700"}`}>
                          {t.points > 0 ? "+" : "−"}
                          {Math.abs(t.points).toLocaleString("en-PH")}
                        </td>
                        <td className="py-2 text-right tabular-nums text-zinc-600">{t.balanceAfter.toLocaleString("en-PH")}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {tab === "prescriptions" && (
            <ul className="mt-2 divide-y divide-zinc-100 text-sm">
              {prescriptions.length === 0 ? (
                <li className="py-8 text-center text-zinc-400">No prescriptions.</li>
              ) : (
                prescriptions.map((p) => (
                  <li key={p.id} className="flex items-center justify-between py-2">
                    <span className="font-medium text-zinc-800">{p.number}</span>
                    <span className="text-zinc-500">
                      {formatDate(p.writtenDate)} · {p.status.charAt(0) + p.status.slice(1).toLowerCase()}
                    </span>
                  </li>
                ))
              )}
            </ul>
          )}
        </div>
      </div>

      {adjusting && (
        <AdjustPointsModal
          customerId={customer.id}
          balance={customer.loyaltyPoints}
          onClose={() => setAdjusting(false)}
          onDone={() => {
            setAdjusting(false);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function AdjustPointsModal({ customerId, balance, onClose, onDone }: { customerId: string; balance: number; onClose: () => void; onDone: () => void }) {
  const [direction, setDirection] = useState<"add" | "remove">("add");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const n = parseInt(amount, 10) || 0;
  const after = direction === "add" ? balance + n : balance - n;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (n <= 0) return setError("Enter how many points.");
    if (!reason.trim()) return setError("Enter a reason.");
    if (after < 0) return setError(`The customer only has ${balance} points.`);
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/customers/${customerId}/points`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ points: direction === "add" ? n : -n, reason: reason.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to adjust points.");
        return;
      }
      onDone();
    } catch {
      setError("Network error.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-zinc-900">
            <Gift className="h-5 w-5 text-violet-600" /> Adjust points
          </h2>
          <button type="button" onClick={onClose} className="p-1 text-zinc-400 hover:text-zinc-600">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {(["add", "remove"] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDirection(d)}
              className={`rounded-lg border py-2 text-sm font-medium ${direction === d ? "border-violet-500 bg-violet-50 text-violet-700" : "border-zinc-300 text-zinc-600"}`}
            >
              {d === "add" ? "Add points" : "Remove points"}
            </button>
          ))}
        </div>
        <input autoFocus value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="Points" className={input} />
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (e.g. points from old loyalty card)" className={input} />
        <p className="text-sm text-zinc-500">
          Balance: {balance.toLocaleString("en-PH")} → <span className={after < 0 ? "font-semibold text-red-600" : "font-semibold text-zinc-900"}>{after.toLocaleString("en-PH")}</span>
        </p>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-full border border-zinc-300 px-4 py-2 text-sm text-zinc-700">
            Cancel
          </button>
          <button type="submit" disabled={saving} className="flex items-center gap-2 rounded-full bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-60">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save
          </button>
        </div>
      </form>
    </div>
  );
}
