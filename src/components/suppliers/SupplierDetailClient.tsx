"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { ArrowLeft, Ban, Loader2, Pencil, Search, Trash2, Undo2, Wallet, X } from "lucide-react";
import { formatDate, peso } from "@/lib/format";
import { useDebouncedValue } from "@/lib/useDebouncedValue";
import SupplierForm, { termsLabel, type SupplierDetails } from "./SupplierForm";

interface Delivery {
  id: string;
  receivingNumber: string;
  referenceNumber: string | null;
  receivedAt: string;
  branchName: string;
  receivedBy: string;
  itemCount: number;
  totalCost: number;
  dueDate?: string | null;
  amountPaid?: number;
}

interface Payment {
  id: string;
  amount: number;
  paidAt: string;
  method: string;
  referenceNumber: string | null;
  notes: string | null;
  voidedAt: string | null;
  recordedBy: string;
  appliedTo: { receivingNumber: string; amount: number }[];
}

interface SupplierReturn {
  id: string;
  returnNumber: string;
  referenceNumber: string | null;
  returnedAt: string;
  reason: string;
  settlement: string;
  notes: string | null;
  totalCost: number;
  branchName: string;
  createdBy: string;
  items: { id: string; name: string; batchNumber: string; quantity: number; unitCost: number }[];
}

interface Detail {
  canPay: boolean;
  canReturn: boolean;
  supplier: SupplierDetails & { id: string; isActive: boolean };
  balance: { purchases: number; open: number; overdue: number; dueThisWeek: number; credit: number; balance: number } | null;
  deliveries: Delivery[];
  payments: Payment[];
  returns: SupplierReturn[];
}

const METHODS: Record<string, string> = { CASH: "Cash", BANK_TRANSFER: "Bank transfer", CHECK: "Check", E_WALLET: "E-wallet" };
const REASONS: Record<string, string> = { EXPIRED: "Expired", NEAR_EXPIRY: "Near expiry", DAMAGED: "Damaged", WRONG_ITEM: "Wrong item", OTHER: "Other" };
const SETTLEMENTS: Record<string, string> = { CREDIT: "Credit", REPLACEMENT: "Replacement", REFUND: "Refund" };
const todayPH = () => new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);

function deliveryStatus(d: Delivery) {
  if (d.amountPaid === undefined) return null;
  const open = Math.round((d.totalCost - d.amountPaid) * 100) / 100;
  if (open <= 0) return { label: "Paid", tone: "bg-emerald-50 text-emerald-700" };
  const overdue = d.dueDate && d.dueDate.slice(0, 10) < todayPH();
  if (overdue) return { label: `Overdue · ${peso(open)}`, tone: "bg-red-50 text-red-700" };
  const partly = d.amountPaid > 0;
  return { label: `${partly ? "Partly paid · " : ""}${peso(open)} due ${d.dueDate ? formatDate(d.dueDate) : ""}`, tone: "bg-amber-50 text-amber-800" };
}

export default function SupplierDetailClient({ supplierId }: { supplierId: string }) {
  const { data, mutate, error } = useSWR<Detail>(`/api/suppliers/${supplierId}`);
  const [tab, setTab] = useState<"deliveries" | "payments" | "returns">("deliveries");
  const [editing, setEditing] = useState(false);
  const [paying, setPaying] = useState(false);
  const [returning, setReturning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (error) return <p className="text-sm text-red-600">Couldn&apos;t load this supplier.</p>;
  if (!data) return <p className="text-sm text-zinc-400">Loading...</p>;
  const { supplier, balance, canPay, canReturn } = data;

  const toggleActive = async () => {
    await fetch(`/api/suppliers/${supplierId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isActive: !supplier.isActive }) });
    await mutate();
  };
  const voidPayment = async (p: Payment) => {
    if (!confirm(`Void the ${peso(p.amount)} payment of ${formatDate(p.paidAt)}? The deliveries it paid will be unpaid again.`)) return;
    const res = await fetch(`/api/suppliers/payments/${p.id}/void`, { method: "POST" });
    const body = await res.json();
    setMessage(res.ok ? "Payment voided." : body.error ?? "Couldn't void the payment.");
    await mutate();
  };

  const tabs = [
    { key: "deliveries" as const, label: `Deliveries (${data.deliveries.length})` },
    ...(canPay ? [{ key: "payments" as const, label: `Payments (${data.payments.filter((p) => !p.voidedAt).length})` }] : []),
    { key: "returns" as const, label: `Returns (${data.returns.length})` },
  ];

  return (
    <div>
      <Link href="/suppliers" className="inline-flex items-center gap-1 text-sm font-medium text-zinc-500 hover:text-zinc-800">
        <ArrowLeft className="h-4 w-4" /> Suppliers
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-zinc-900">
            {supplier.name}
            {!supplier.isActive && <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-500">Inactive</span>}
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            {termsLabel(supplier.paymentTermsDays)}
            {supplier.contactPerson && ` · ${supplier.contactPerson}`}
            {supplier.phone && ` · ${supplier.phone}`}
            {supplier.email && ` · ${supplier.email}`}
          </p>
          {(supplier.address || supplier.tin) && (
            <p className="text-xs text-zinc-400">
              {supplier.address}
              {supplier.address && supplier.tin && " · "}
              {supplier.tin && `TIN ${supplier.tin}`}
            </p>
          )}
          {supplier.notes && <p className="mt-1 max-w-2xl text-xs text-zinc-500">{supplier.notes}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          {canPay && (
            <button onClick={() => setPaying(true)} className="flex items-center gap-2 rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500">
              <Wallet className="h-4 w-4" /> Record payment
            </button>
          )}
          {canReturn && (
            <button onClick={() => setReturning(true)} className="flex items-center gap-2 rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:border-zinc-400">
              <Undo2 className="h-4 w-4" /> Return items
            </button>
          )}
          <button onClick={() => setEditing(true)} className="flex items-center gap-2 rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:border-zinc-400">
            <Pencil className="h-4 w-4" /> Edit
          </button>
          <button onClick={toggleActive} className="rounded-full px-3 py-2 text-sm font-medium text-zinc-500 hover:text-zinc-800">
            {supplier.isActive ? "Deactivate" : "Reactivate"}
          </button>
        </div>
      </div>

      {canPay && balance && (
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Balance owed" value={balance.balance >= 0 ? peso(balance.balance) : `${peso(-balance.balance)} credit`} strong />
          <Stat label="Overdue" value={peso(balance.overdue)} tone={balance.overdue > 0 ? "text-red-600" : undefined} />
          <Stat label="Credit on file" value={peso(balance.credit)} hint="Used on the next deliveries" />
          <Stat label="Total purchases" value={peso(balance.purchases)} />
        </div>
      )}
      {message && <p className="mt-4 rounded-lg bg-zinc-50 px-3 py-2 text-sm text-zinc-700">{message}</p>}

      <div className="mt-6 flex gap-1 overflow-x-auto border-b border-zinc-200">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`shrink-0 whitespace-nowrap px-4 py-2 text-sm font-semibold ${tab === t.key ? "border-b-2 border-emerald-600 text-emerald-700" : "text-zinc-500 hover:text-zinc-700"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "deliveries" && (
        <Table
          empty="No deliveries from this supplier yet."
          head={["Received", "DR / Invoice #", "Branch", "Items", "Total", ...(canPay ? ["Payment"] : [])]}
          rows={data.deliveries.map((d) => {
            const st = deliveryStatus(d);
            return [
              <span key="r">
                <span className="block text-zinc-900">{formatDate(d.receivedAt)}</span>
                <span className="block text-xs text-zinc-400">{d.receivingNumber}</span>
              </span>,
              d.referenceNumber ?? <span className="text-zinc-300">—</span>,
              d.branchName,
              d.itemCount,
              <span key="t" className="font-semibold tabular-nums">{peso(d.totalCost)}</span>,
              ...(canPay ? [st ? <span key="s" className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${st.tone}`}>{st.label}</span> : null] : []),
            ];
          })}
        />
      )}

      {tab === "payments" && canPay && (
        <Table
          empty="No payments recorded yet."
          head={["Paid", "Amount", "Method", "Applied to", "Recorded by", ""]}
          rows={data.payments.map((p) => [
            <span key="d" className={p.voidedAt ? "text-zinc-400 line-through" : ""}>{formatDate(p.paidAt)}</span>,
            <span key="a" className={`font-semibold tabular-nums ${p.voidedAt ? "text-zinc-400 line-through" : ""}`}>{peso(p.amount)}</span>,
            <span key="m">
              {METHODS[p.method] ?? p.method}
              {p.referenceNumber && <span className="block text-xs text-zinc-400">Ref {p.referenceNumber}</span>}
            </span>,
            p.voidedAt ? (
              <span key="v" className="text-xs font-semibold text-zinc-400">Voided {formatDate(p.voidedAt)}</span>
            ) : (
              <span key="ap" className="text-xs text-zinc-600">
                {p.appliedTo.length ? p.appliedTo.map((a) => `${a.receivingNumber} (${peso(a.amount)})`).join(", ") : "Credit — not used yet"}
              </span>
            ),
            p.recordedBy,
            p.voidedAt ? null : (
              <button key="x" onClick={() => voidPayment(p)} className="inline-flex items-center gap-1 text-xs font-medium text-zinc-500 hover:text-red-600">
                <Ban className="h-3.5 w-3.5" /> Void
              </button>
            ),
          ])}
        />
      )}

      {tab === "returns" && (
        <Table
          empty="No returns to this supplier."
          head={["Returned", "Items", "Reason", "Settled by", "Total", "Branch"]}
          rows={data.returns.map((r) => [
            <span key="d">
              <span className="block text-zinc-900">{formatDate(r.returnedAt)}</span>
              <span className="block text-xs text-zinc-400">
                {r.returnNumber}
                {r.referenceNumber && ` · ${r.referenceNumber}`}
              </span>
            </span>,
            <span key="i" className="text-xs text-zinc-600">{r.items.map((i) => `${i.quantity}× ${i.name} (${i.batchNumber})`).join(", ")}</span>,
            REASONS[r.reason] ?? r.reason,
            SETTLEMENTS[r.settlement] ?? r.settlement,
            <span key="t" className="font-semibold tabular-nums">{peso(r.totalCost)}</span>,
            r.branchName,
          ])}
        />
      )}

      {editing && (
        <SupplierForm
          initial={supplier}
          onClose={() => setEditing(false)}
          onSaved={async () => {
            setEditing(false);
            await mutate();
          }}
        />
      )}
      {paying && (
        <PaymentModal
          supplierId={supplierId}
          deliveries={data.deliveries}
          suggested={Math.max(0, balance?.balance ?? 0)}
          onClose={() => setPaying(false)}
          onSaved={async (msg) => {
            setPaying(false);
            setMessage(msg);
            await mutate();
            setTab("payments");
          }}
        />
      )}
      {returning && (
        <ReturnModal
          supplierId={supplierId}
          onClose={() => setReturning(false)}
          onSaved={async (msg) => {
            setReturning(false);
            setMessage(msg);
            await mutate();
            setTab("returns");
          }}
        />
      )}
    </div>
  );
}

function Stat({ label, value, hint, tone, strong }: { label: string; value: string; hint?: string; tone?: string; strong?: boolean }) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium text-zinc-500">{label}</p>
      <p className={`mt-0.5 tabular-nums ${strong ? "text-2xl" : "text-xl"} font-semibold ${tone ?? "text-zinc-900"}`}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-zinc-400">{hint}</p>}
    </div>
  );
}

function Table({ head, rows, empty }: { head: string[]; rows: React.ReactNode[][]; empty: string }) {
  return (
    <div className="mt-4 overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="border-b border-zinc-100 text-left text-xs font-medium uppercase text-zinc-400">
            {head.map((h, i) => (
              <th key={i} className="px-4 py-3">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={head.length} className="px-4 py-10 text-center text-zinc-400">
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((cells, i) => (
              <tr key={i} className="border-b border-zinc-50 align-top last:border-0">
                {cells.map((c, j) => (
                  <td key={j} className="px-4 py-3 text-zinc-700">
                    {c}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

const modalInput = "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20";

function Modal({ title, children, footer, onClose }: { title: string; children: React.ReactNode; footer: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4">
          <h2 className="text-lg font-semibold text-zinc-900">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">{children}</div>
        <div className="flex items-center justify-between gap-3 border-t border-zinc-100 bg-zinc-50 px-5 py-3">{footer}</div>
      </div>
    </div>
  );
}

function PaymentModal({
  supplierId,
  deliveries,
  suggested,
  onClose,
  onSaved,
}: {
  supplierId: string;
  deliveries: Delivery[];
  suggested: number;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const open = deliveries
    .map((d) => ({ ...d, open: Math.round((d.totalCost - (d.amountPaid ?? 0)) * 100) / 100 }))
    .filter((d) => d.open > 0)
    .sort((a, b) => (a.dueDate ?? a.receivedAt).localeCompare(b.dueDate ?? b.receivedAt));
  const [picked, setPicked] = useState<string[]>([]);
  const [amount, setAmount] = useState(suggested ? String(suggested) : "");
  const [paidOn, setPaidOn] = useState(todayPH());
  const [method, setMethod] = useState("BANK_TRANSFER");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const togglePick = (id: string) => {
    const next = picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id];
    setPicked(next);
    if (next.length) setAmount(String(Math.round(open.filter((d) => next.includes(d.id)).reduce((s, d) => s + d.open, 0) * 100) / 100));
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/suppliers/${supplierId}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: Number(amount), paidOn, method, referenceNumber, notes, receivingIds: picked }),
      });
      const data = await res.json();
      if (!res.ok) return setError(data.error ?? "Couldn't record the payment.");
      onSaved(data.credit > 0 ? `Payment recorded. ${peso(data.credit)} is kept as credit for the next delivery.` : "Payment recorded.");
    } catch {
      setError("Network error.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title="Record payment"
      onClose={onClose}
      footer={
        <>
          <p className="min-w-0 text-sm text-red-600">{error}</p>
          <div className="flex shrink-0 gap-2">
            <button onClick={onClose} className="rounded-full border border-zinc-300 px-4 py-2 text-sm text-zinc-700 hover:bg-white">
              Cancel
            </button>
            <button onClick={save} disabled={saving || !(Number(amount) > 0)} className="flex items-center gap-2 rounded-full bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Record {Number(amount) > 0 ? peso(Number(amount)) : "payment"}
            </button>
          </div>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-600">Amount paid</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-zinc-400">₱</span>
            <input type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className={`${modalInput} pl-7`} />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-600">Date paid</label>
          <input type="date" value={paidOn} max={todayPH()} onChange={(e) => setPaidOn(e.target.value)} className={modalInput} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-600">Paid by</label>
          <select value={method} onChange={(e) => setMethod(e.target.value)} className={modalInput}>
            {Object.entries(METHODS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-3">
          <label className="mb-1 block text-xs font-medium text-zinc-600">Reference (check #, bank ref, OR #)</label>
          <input value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} className={modalInput} />
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-xs font-medium text-zinc-600">Pay which deliveries? <span className="font-normal text-zinc-400">Leave unticked to pay the oldest due first.</span></p>
        {open.length === 0 ? (
          <p className="rounded-lg bg-zinc-50 px-3 py-2 text-sm text-zinc-500">Nothing is owed right now — this payment will be kept as credit.</p>
        ) : (
          <ul className="divide-y divide-zinc-100 rounded-xl border border-zinc-200">
            {open.map((d) => {
              const overdue = d.dueDate && d.dueDate.slice(0, 10) < todayPH();
              return (
                <li key={d.id}>
                  <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 text-sm hover:bg-zinc-50">
                    <input type="checkbox" checked={picked.includes(d.id)} onChange={() => togglePick(d.id)} className="h-4 w-4 accent-emerald-600" />
                    <span className="min-w-0 flex-1">
                      <span className="text-zinc-800">{d.receivingNumber}</span>
                      {d.referenceNumber && <span className="text-zinc-400"> · DR {d.referenceNumber}</span>}
                      <span className={`block text-xs ${overdue ? "font-semibold text-red-600" : "text-zinc-400"}`}>
                        {overdue ? "Overdue since" : "Due"} {d.dueDate ? formatDate(d.dueDate) : formatDate(d.receivedAt)}
                      </span>
                    </span>
                    <span className="font-semibold tabular-nums text-zinc-900">{peso(d.open)}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-zinc-600">Notes (optional)</label>
        <input value={notes} onChange={(e) => setNotes(e.target.value)} className={modalInput} />
      </div>
    </Modal>
  );
}

interface Lot {
  id: string;
  name: string;
  detail: string;
  batchNumber: string;
  expirationDate: string;
  isExpired: boolean;
  quantity: number;
  unitCost: number;
  fromThisSupplier: boolean;
}

function ReturnModal({ supplierId, onClose, onSaved }: { supplierId: string; onClose: () => void; onSaved: (message: string) => void }) {
  const [q, setQ] = useState("");
  const query = useDebouncedValue(q.trim(), 250);
  const { data: lots = [], isLoading } = useSWR<Lot[]>(`/api/suppliers/${supplierId}/returnable${query ? `?q=${encodeURIComponent(query)}` : ""}`, { keepPreviousData: true });
  const [lines, setLines] = useState<{ lot: Lot; quantity: string }[]>([]);
  const [reason, setReason] = useState("EXPIRED");
  const [settlement, setSettlement] = useState("CREDIT");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const total = lines.reduce((s, l) => s + (parseInt(l.quantity, 10) || 0) * l.lot.unitCost, 0);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/suppliers/${supplierId}/returns`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason, settlement, referenceNumber, notes, items: lines.map((l) => ({ batchId: l.lot.id, quantity: parseInt(l.quantity, 10) })) }),
      });
      const data = await res.json();
      if (!res.ok) return setError(data.error ?? "Couldn't record the return.");
      onSaved(`${data.returnNumber} recorded — stock taken out${settlement === "CREDIT" ? ` and ${peso(data.totalCost)} credited` : ""}.`);
    } catch {
      setError("Network error.");
    } finally {
      setSaving(false);
    }
  };

  const available = lots.filter((l) => !lines.some((x) => x.lot.id === l.id));

  return (
    <Modal
      title="Return items to supplier"
      onClose={onClose}
      footer={
        <>
          <div className="min-w-0 text-sm">
            <span className="font-semibold text-zinc-900">Total {peso(total)}</span>
            {error && <p className="text-red-600">{error}</p>}
          </div>
          <div className="flex shrink-0 gap-2">
            <button onClick={onClose} className="rounded-full border border-zinc-300 px-4 py-2 text-sm text-zinc-700 hover:bg-white">
              Cancel
            </button>
            <button onClick={save} disabled={saving || lines.length === 0} className="flex items-center gap-2 rounded-full bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Record return
            </button>
          </div>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-600">Reason</label>
          <select value={reason} onChange={(e) => setReason(e.target.value)} className={modalInput}>
            {Object.entries(REASONS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-600">Supplier settles by</label>
          <select value={settlement} onChange={(e) => setSettlement(e.target.value)} className={modalInput}>
            <option value="CREDIT">Credit (less from what we owe)</option>
            <option value="REPLACEMENT">Replacement</option>
            <option value="REFUND">Refund</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-600">Credit memo / RA #</label>
          <input value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} className={modalInput} />
        </div>
      </div>

      {lines.length > 0 && (
        <ul className="divide-y divide-zinc-100 rounded-xl border border-zinc-200">
          {lines.map((l, idx) => (
            <li key={l.lot.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
              <span className="min-w-0 flex-1">
                <span className="text-zinc-800">{l.lot.name}</span>
                <span className="block text-xs text-zinc-400">
                  Batch {l.lot.batchNumber} · exp {formatDate(l.lot.expirationDate)} · {l.lot.quantity} on hand
                </span>
              </span>
              <input
                type="number"
                min={1}
                max={l.lot.quantity}
                value={l.quantity}
                onChange={(e) => setLines((prev) => prev.map((x, i) => (i === idx ? { ...x, quantity: e.target.value } : x)))}
                className="w-20 rounded-lg border border-zinc-300 px-2 py-1.5 text-right text-sm"
                aria-label={`Quantity of ${l.lot.name} to return`}
              />
              <span className="w-24 text-right tabular-nums text-zinc-700">{peso((parseInt(l.quantity, 10) || 0) * l.lot.unitCost)}</span>
              <button onClick={() => setLines((prev) => prev.filter((_, i) => i !== idx))} className="rounded-lg p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-600" aria-label="Remove">
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div>
        <label className="mb-1 flex items-center gap-2 rounded-lg border border-dashed border-emerald-300 bg-emerald-50/40 px-3 py-2.5 focus-within:border-emerald-500 focus-within:bg-white">
          <Search className="h-4 w-4 text-emerald-600" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a lot at this branch to return" className="w-full bg-transparent text-sm outline-none" />
          {isLoading && <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />}
        </label>
        <ul className="max-h-56 divide-y divide-zinc-100 overflow-y-auto rounded-xl border border-zinc-200">
          {available.length === 0 ? (
            <li className="px-3 py-4 text-center text-sm text-zinc-400">No lots from this supplier on hand here.</li>
          ) : (
            available.map((lot) => (
              <li key={lot.id}>
                <button
                  onClick={() => setLines((prev) => [...prev, { lot, quantity: String(lot.quantity) }])}
                  className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-emerald-50"
                >
                  <span className="min-w-0 flex-1">
                    <span className="text-zinc-800">{lot.name}</span>
                    {!lot.fromThisSupplier && <span className="ml-1.5 text-[11px] text-zinc-400">(no supplier recorded)</span>}
                    <span className={`block text-xs ${lot.isExpired ? "font-semibold text-red-600" : "text-zinc-400"}`}>
                      Batch {lot.batchNumber} · {lot.isExpired ? "expired" : "exp"} {formatDate(lot.expirationDate)}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-zinc-500">{lot.quantity} on hand</span>
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-zinc-600">Notes (optional)</label>
        <input value={notes} onChange={(e) => setNotes(e.target.value)} className={modalInput} />
      </div>
    </Modal>
  );
}
