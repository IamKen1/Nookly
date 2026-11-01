"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { ChevronRight, Loader2, PackageCheck, Plus, Search, Trash2, X } from "lucide-react";
import { formatDate, formatDateTime, peso } from "@/lib/format";
import { useDebouncedValue } from "@/lib/useDebouncedValue";

interface ReceivingLine {
  id: string;
  productId: string;
  name: string;
  detail: string;
  batchNumber: string;
  expirationDate: string;
  quantity: number;
  unitCost: number;
}

interface Receiving {
  id: string;
  receivingNumber: string;
  referenceNumber: string | null;
  receivedAt: string;
  notes: string | null;
  totalCost: number;
  // Present for users who handle supplier payments.
  dueDate?: string | null;
  amountPaid?: number;
  supplier: { id: string; name: string } | null;
  branchName: string;
  receivedBy: string;
  items: ReceivingLine[];
}

interface Supplier {
  id: string;
  name: string;
  paymentTermsDays?: number;
}

// Deliveries received at this branch: what came in, from whom, under which DR /
// invoice, and who received it. Receiving a delivery is done here too.
export default function ReceivingPanel({ canAdjust, canSeeAllBranches, canPay = false }: { canAdjust: boolean; canSeeAllBranches: boolean; canPay?: boolean }) {
  const [q, setQ] = useState("");
  const query = useDebouncedValue(q.trim(), 300);
  const [supplierId, setSupplierId] = useState("");
  const [allBranches, setAllBranches] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [justReceived, setJustReceived] = useState<string | null>(null);
  const [showReceive, setShowReceive] = useState(false);

  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (supplierId) params.set("supplierId", supplierId);
  if (allBranches) params.set("branch", "all");
  const { data: receivings = [], isLoading, mutate } = useSWR<Receiving[]>(`/api/inventory/receivings?${params}`, { keepPreviousData: true });
  const { data: suppliers = [], mutate: refreshSuppliers } = useSWR<Supplier[]>("/api/suppliers");

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 sm:min-w-64">
          <Search className="h-4 w-4 shrink-0 text-zinc-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search RCV #, DR / invoice #, supplier, product, or batch"
            className="w-full text-sm outline-none"
          />
        </label>
        <select
          value={supplierId}
          onChange={(e) => setSupplierId(e.target.value)}
          className="rounded-lg border border-zinc-200 bg-white px-2.5 py-2 text-sm"
          aria-label="Supplier"
        >
          <option value="">All suppliers</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        {canSeeAllBranches && (
          <select
            value={allBranches ? "all" : "here"}
            onChange={(e) => setAllBranches(e.target.value === "all")}
            className="rounded-lg border border-zinc-200 bg-white px-2.5 py-2 text-sm"
            aria-label="Branch"
          >
            <option value="here">This branch</option>
            <option value="all">All branches</option>
          </select>
        )}
        {canAdjust && (
          <button
            onClick={() => setShowReceive(true)}
            className="ml-auto flex items-center gap-2 rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
          >
            <Plus className="h-4 w-4" /> Receive delivery
          </button>
        )}
      </div>

      <div className="mt-4 overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-zinc-100 text-left text-xs font-medium uppercase text-zinc-400">
              <th className="px-4 py-3">Received</th>
              <th className="px-4 py-3">Supplier</th>
              <th className="px-4 py-3">DR / Invoice #</th>
              <th className="px-4 py-3 text-right">Items</th>
              <th className="px-4 py-3 text-right">Total cost</th>
              <th className="px-4 py-3">Received by</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && receivings.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-zinc-400">
                  Loading...
                </td>
              </tr>
            ) : receivings.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-zinc-400">
                  {query || supplierId ? "No deliveries match." : "No deliveries received yet. Use Receive delivery when stock arrives."}
                </td>
              </tr>
            ) : (
              receivings.map((r) => {
                const open = expanded.has(r.id);
                const units = r.items.reduce((s, i) => s + i.quantity, 0);
                return (
                  <Fragment key={r.id}>
                    <tr
                      onClick={() => toggle(r.id)}
                      aria-expanded={open}
                      className={`cursor-pointer border-b border-zinc-100 transition hover:bg-zinc-50 ${open ? "bg-zinc-50/70" : ""} ${
                        justReceived === r.id ? "bg-emerald-50/70" : ""
                      }`}
                    >
                      <td className="px-4 py-3">
                        <span className="flex items-start gap-2">
                          <ChevronRight className={`mt-0.5 h-4 w-4 shrink-0 text-zinc-400 transition-transform ${open ? "rotate-90" : ""}`} />
                          <span>
                            <span className="block font-medium text-zinc-900">{formatDateTime(r.receivedAt)}</span>
                            <span className="block text-xs text-zinc-400">
                              {r.receivingNumber}
                              {allBranches && ` · ${r.branchName}`}
                            </span>
                          </span>
                        </span>
                      </td>
                      <td className="px-4 py-3 text-zinc-800">{r.supplier?.name ?? <span className="text-zinc-300">—</span>}</td>
                      <td className="px-4 py-3 text-zinc-600">{r.referenceNumber ?? <span className="text-zinc-300">—</span>}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-zinc-600">
                        {r.items.length} <span className="text-xs text-zinc-400">({units.toLocaleString("en-PH")} units)</span>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        <span className="font-semibold text-zinc-900">{peso(r.totalCost)}</span>
                        {r.amountPaid !== undefined && <PaymentBadge total={r.totalCost} paid={r.amountPaid} dueDate={r.dueDate ?? null} />}
                      </td>
                      <td className="px-4 py-3 text-zinc-600">{r.receivedBy}</td>
                    </tr>
                    {open && (
                      <tr className="border-b border-zinc-100 bg-zinc-50/40">
                        <td colSpan={6} className="px-4 pb-4 pt-1">
                          <table className="ml-6 w-[calc(100%-1.5rem)] text-sm">
                            <thead>
                              <tr className="text-left text-[11px] font-medium uppercase tracking-wide text-zinc-400">
                                <th className="py-2 font-medium">Product</th>
                                <th className="py-2 font-medium">Batch / lot</th>
                                <th className="py-2 font-medium">Expiry</th>
                                <th className="py-2 text-right font-medium">Qty</th>
                                <th className="py-2 text-right font-medium">Unit cost</th>
                                <th className="py-2 text-right font-medium">Amount</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-100">
                              {r.items.map((i) => (
                                <tr key={i.id}>
                                  <td className="py-2 pr-3">
                                    <span className="text-zinc-800">{i.name}</span>
                                    {i.detail && <span className="block text-xs text-zinc-400">{i.detail}</span>}
                                  </td>
                                  <td className="py-2 pr-3 text-zinc-600">{i.batchNumber}</td>
                                  <td className="py-2 pr-3 text-zinc-600">{formatDate(i.expirationDate)}</td>
                                  <td className="py-2 text-right tabular-nums text-zinc-700">{i.quantity.toLocaleString("en-PH")}</td>
                                  <td className="py-2 text-right tabular-nums text-zinc-600">{peso(i.unitCost)}</td>
                                  <td className="py-2 text-right tabular-nums text-zinc-900">{peso(i.quantity * i.unitCost)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {r.notes && <p className="ml-6 mt-2 text-xs text-zinc-500">Note: {r.notes}</p>}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      {receivings.length >= 100 && <p className="mt-2 text-xs text-zinc-400">Showing the latest 100 — search or filter by supplier to find older ones.</p>}

      {showReceive && (
        <ReceiveDeliveryModal
          suppliers={suppliers}
          canPay={canPay}
          onSupplierAdded={() => refreshSuppliers()}
          onClose={() => setShowReceive(false)}
          onReceived={async (id) => {
            setShowReceive(false);
            await mutate();
            setExpanded((prev) => new Set(prev).add(id));
            setJustReceived(id);
            setTimeout(() => setJustReceived(null), 4000);
          }}
        />
      )}
    </div>
  );
}

interface ProductHit {
  id: string;
  name: string;
  strength: string | null;
  dosageForm: string | null;
  costPrice: string | number;
  currentStock: number;
}

interface DraftLine {
  key: string;
  productId: string;
  name: string;
  detail: string;
  batchNumber: string;
  expirationDate: string;
  quantity: string;
  unitCost: string;
}

const NEW_SUPPLIER = "__new";

// Paid / due / overdue under a delivery's total, for those who handle payments.
function PaymentBadge({ total, paid, dueDate }: { total: number; paid: number; dueDate: string | null }) {
  const open = Math.round((total - paid) * 100) / 100;
  if (open <= 0) return <span className="block text-[11px] font-medium text-emerald-700">Paid</span>;
  const overdue = dueDate && dueDate.slice(0, 10) < todayPH();
  return (
    <span className={`block text-[11px] font-medium ${overdue ? "text-red-600" : "text-amber-700"}`}>
      {overdue ? "Overdue" : paid > 0 ? "Partly paid" : "Unpaid"}
      {dueDate && !overdue ? ` · due ${formatDate(dueDate)}` : ""}
    </span>
  );
}
const todayPH = () => new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
const dueOn = (receivedDate: string, days: number) => new Date(new Date(`${receivedDate}T12:00:00+08:00`).getTime() + days * 86400000).toISOString();

function ReceiveDeliveryModal({
  suppliers,
  canPay,
  onSupplierAdded,
  onClose,
  onReceived,
}: {
  suppliers: Supplier[];
  canPay: boolean;
  onSupplierAdded: () => void;
  onClose: () => void;
  onReceived: (id: string) => void;
}) {
  const [supplierId, setSupplierId] = useState("");
  const [newSupplierName, setNewSupplierName] = useState("");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [receivedDate, setReceivedDate] = useState(todayPH());
  const [notes, setNotes] = useState("");
  const [paidNow, setPaidNow] = useState(false);
  const [paidMethod, setPaidMethod] = useState("CASH");
  const [paidRef, setPaidRef] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [search, setSearch] = useState("");
  const query = useDebouncedValue(search.trim(), 250);
  const { data: hits = [], isLoading: searching } = useSWR<ProductHit[]>(query.length >= 2 ? `/api/products?search=${encodeURIComponent(query)}` : null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const focusKey = useRef<string | null>(null);
  const lineSeq = useRef(0);

  useEffect(() => {
    if (!focusKey.current) return;
    document.querySelector<HTMLInputElement>(`[data-batch-input="${focusKey.current}"]`)?.focus();
    focusKey.current = null;
  }, [lines]);

  const addProduct = (p: ProductHit) => {
    const key = `${p.id}-${++lineSeq.current}`;
    focusKey.current = key;
    setLines((prev) => [
      ...prev,
      {
        key,
        productId: p.id,
        name: p.name,
        detail: [p.strength, p.dosageForm].filter(Boolean).join(" · "),
        batchNumber: "",
        expirationDate: "",
        quantity: "",
        unitCost: Number(p.costPrice) ? String(Number(p.costPrice)) : "",
      },
    ]);
    setSearch("");
  };
  const update = (key: string, patch: Partial<DraftLine>) => setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const remove = (key: string) => setLines((prev) => prev.filter((l) => l.key !== key));

  const chosenSupplier = suppliers.find((s) => s.id === supplierId) ?? null;
  const totalUnits = lines.reduce((s, l) => s + (parseInt(l.quantity, 10) || 0), 0);
  const totalCost = lines.reduce((s, l) => s + (parseInt(l.quantity, 10) || 0) * (parseFloat(l.unitCost) || 0), 0);
  const incomplete = lines.some((l) => !l.batchNumber.trim() || !l.expirationDate || !(parseInt(l.quantity, 10) > 0) || l.unitCost === "");

  const submit = async () => {
    setError(null);
    if (lines.length === 0) return setError("Add at least one product.");
    if (incomplete) return setError("Fill in the batch, expiry, quantity, and unit cost for every line.");
    if (supplierId === NEW_SUPPLIER && !newSupplierName.trim()) return setError("Enter the new supplier's name, or choose an existing one.");
    setSaving(true);
    try {
      let sid: string | undefined = supplierId || undefined;
      if (sid === NEW_SUPPLIER) {
        const res = await fetch("/api/suppliers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: newSupplierName }),
        });
        const created = await res.json();
        if (!res.ok) return setError(created.error ?? "Failed to add the supplier.");
        sid = created.id;
        setSupplierId(created.id);
        onSupplierAdded();
      }
      const res = await fetch("/api/inventory/receivings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierId: sid,
          referenceNumber,
          receivedDate,
          notes,
          paidNow: paidNow && sid ? { method: paidMethod, referenceNumber: paidRef } : null,
          items: lines.map((l) => ({
            productId: l.productId,
            batchNumber: l.batchNumber,
            expirationDate: l.expirationDate,
            quantity: parseInt(l.quantity, 10),
            unitCost: parseFloat(l.unitCost),
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) return setError(data.error ?? "Failed to receive the delivery.");
      onReceived(data.id);
    } catch {
      setError("Network error.");
    } finally {
      setSaving(false);
    }
  };

  const input = "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-2 sm:p-4">
      <div className="flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4">
          <div className="flex items-center gap-2">
            <PackageCheck className="h-5 w-5 text-emerald-600" />
            <h2 className="text-lg font-semibold text-zinc-900">Receive delivery</h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">Supplier</label>
              <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className={input}>
                <option value="">— Select supplier —</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
                <option value={NEW_SUPPLIER}>+ Add new supplier…</option>
              </select>
              {supplierId === NEW_SUPPLIER && (
                <input autoFocus value={newSupplierName} onChange={(e) => setNewSupplierName(e.target.value)} placeholder="New supplier name" className={`${input} mt-2`} />
              )}
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">DR / Invoice #</label>
              <input value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} placeholder="From the supplier's document" className={input} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">Date received</label>
              <input type="date" value={receivedDate} max={todayPH()} onChange={(e) => setReceivedDate(e.target.value)} className={input} />
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-baseline justify-between">
              <h3 className="text-sm font-semibold text-zinc-900">Items</h3>
              {lines.length > 0 && <p className="hidden text-xs text-zinc-400 sm:block">Cost per unit is filled from the product; change it if the price changed.</p>}
            </div>

            <div className="relative">
              <label className="flex items-center gap-2 rounded-lg border border-dashed border-emerald-300 bg-emerald-50/40 px-3 py-2.5 focus-within:border-emerald-500 focus-within:bg-white">
                <Search className="h-4 w-4 text-emerald-600" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search a product to add it to this delivery"
                  className="w-full bg-transparent text-sm outline-none"
                />
                {searching && <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />}
              </label>
              {query.length >= 2 && hits.length > 0 && (
                <ul className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-zinc-200 bg-white py-1 shadow-lg">
                  {hits.slice(0, 12).map((p) => (
                    <li key={p.id}>
                      <button type="button" onClick={() => addProduct(p)} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-emerald-50">
                        <span className="min-w-0">
                          <span className="block truncate text-zinc-800">{p.name}</span>
                          <span className="block text-xs text-zinc-400">{[p.strength, p.dosageForm].filter(Boolean).join(" · ")}</span>
                        </span>
                        <span className="shrink-0 text-xs text-zinc-400">{p.currentStock} on hand</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {query.length >= 2 && !searching && hits.length === 0 && (
                <p className="mt-1 text-xs text-zinc-400">No product matches “{query}”. Add it under Products first.</p>
              )}
            </div>

            {lines.length > 0 && (
              <div className="mt-3 rounded-xl border border-zinc-200">
                <div className="hidden grid-cols-[minmax(0,2.2fr)_minmax(0,1.2fr)_minmax(0,1.2fr)_5rem_6.5rem_6.5rem_2rem] gap-2 border-b border-zinc-100 px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-zinc-400 md:grid">
                  <span>Product</span>
                  <span>Batch / lot #</span>
                  <span>Expiry</span>
                  <span className="text-right">Qty</span>
                  <span className="text-right">Unit cost</span>
                  <span className="text-right">Amount</span>
                  <span />
                </div>
                <ul className="divide-y divide-zinc-100">
                  {lines.map((l) => {
                    const amount = (parseInt(l.quantity, 10) || 0) * (parseFloat(l.unitCost) || 0);
                    return (
                      <li
                        key={l.key}
                        className="grid grid-cols-2 items-center gap-2 px-3 py-2.5 md:grid-cols-[minmax(0,2.2fr)_minmax(0,1.2fr)_minmax(0,1.2fr)_5rem_6.5rem_6.5rem_2rem]"
                      >
                        <div className="col-span-2 min-w-0 md:col-span-1">
                          <p className="truncate text-sm text-zinc-800">{l.name}</p>
                          {l.detail && <p className="truncate text-xs text-zinc-400">{l.detail}</p>}
                        </div>
                        <input
                          data-batch-input={l.key}
                          value={l.batchNumber}
                          onChange={(e) => update(l.key, { batchNumber: e.target.value })}
                          placeholder="Batch / lot #"
                          aria-label={`Batch for ${l.name}`}
                          className={input}
                        />
                        <input
                          type="date"
                          value={l.expirationDate}
                          min={todayPH()}
                          onChange={(e) => update(l.key, { expirationDate: e.target.value })}
                          aria-label={`Expiry for ${l.name}`}
                          className={input}
                        />
                        <input
                          type="number"
                          min={1}
                          inputMode="numeric"
                          value={l.quantity}
                          onChange={(e) => update(l.key, { quantity: e.target.value })}
                          placeholder="Qty"
                          aria-label={`Quantity for ${l.name}`}
                          className={`${input} text-right`}
                        />
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          inputMode="decimal"
                          value={l.unitCost}
                          onChange={(e) => update(l.key, { unitCost: e.target.value })}
                          placeholder="Cost"
                          aria-label={`Unit cost for ${l.name}`}
                          className={`${input} text-right`}
                        />
                        <p className="text-right text-sm font-medium tabular-nums text-zinc-900">{peso(amount)}</p>
                        <button
                          type="button"
                          onClick={() => remove(l.key)}
                          className="justify-self-end rounded-lg p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-600"
                          aria-label={`Remove ${l.name}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>

          {chosenSupplier && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm">
              <span className="text-zinc-600">
                {(chosenSupplier.paymentTermsDays ?? 0) === 0 ? "Cash on delivery" : `Terms ${chosenSupplier.paymentTermsDays} days`}
                {!paidNow && (chosenSupplier.paymentTermsDays ?? 0) > 0 && (
                  <>
                    {" "}
                    · due <span className="font-semibold text-zinc-800">{formatDate(dueOn(receivedDate, chosenSupplier.paymentTermsDays ?? 0))}</span>
                  </>
                )}
              </span>
              {canPay && (
                <label className="flex items-center gap-2 text-zinc-700">
                  <input type="checkbox" checked={paidNow} onChange={(e) => setPaidNow(e.target.checked)} className="h-4 w-4 accent-emerald-600" />
                  Paid on delivery
                </label>
              )}
              {canPay && paidNow && (
                <>
                  <select value={paidMethod} onChange={(e) => setPaidMethod(e.target.value)} className="rounded-lg border border-zinc-300 bg-white px-2 py-1 text-sm" aria-label="Paid by">
                    <option value="CASH">Cash</option>
                    <option value="BANK_TRANSFER">Bank transfer</option>
                    <option value="CHECK">Check</option>
                    <option value="E_WALLET">E-wallet</option>
                  </select>
                  <input value={paidRef} onChange={(e) => setPaidRef(e.target.value)} placeholder="Reference (optional)" className="w-40 rounded-lg border border-zinc-300 bg-white px-2 py-1 text-sm" />
                </>
              )}
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-600">Notes (optional)</label>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. 2 boxes damaged, returned to driver" className={input} />
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-zinc-100 bg-zinc-50 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm">
            <span className="text-zinc-500">
              {lines.length} item{lines.length === 1 ? "" : "s"} · {totalUnits.toLocaleString("en-PH")} units ·{" "}
            </span>
            <span className="font-semibold text-zinc-900">Total {peso(totalCost)}</span>
            {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded-full border border-zinc-300 px-4 py-2 text-sm text-zinc-700 hover:bg-white">
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={saving || lines.length === 0}
              className="flex items-center gap-2 rounded-full bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {saving ? "Receiving..." : `Receive ${lines.length || ""} item${lines.length === 1 ? "" : "s"}`.replace("  ", " ")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
