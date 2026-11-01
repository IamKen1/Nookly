"use client";

import { useState } from "react";
import useSWR from "swr";
import { Loader2, Lock, Pencil, Plus, Trash2, X } from "lucide-react";
import { peso, formatDate } from "@/lib/format";
import type { DiscountDTO } from "@/lib/discounts";

interface Branch {
  id: string;
  name: string;
  isActive?: boolean;
}

interface Draft {
  id: string | null;
  name: string;
  kind: "PERCENT" | "FIXED";
  value: string;
  maxAmount: string;
  vatExempt: boolean;
  asksForId: boolean;
  isActive: boolean;
  startsOn: string;
  endsOn: string;
  storeIds: string[];
}

const EMPTY: Draft = {
  id: null,
  name: "",
  kind: "PERCENT",
  value: "",
  maxAmount: "",
  vatExempt: false,
  asksForId: false,
  isActive: true,
  startsOn: "",
  endsOn: "",
  storeIds: [],
};

const rateOf = (d: DiscountDTO) =>
  d.kind === "FIXED" ? `${peso(d.value)} off` : `${Number(d.value.toFixed(2))}% off${d.maxAmount != null ? `, up to ${peso(d.maxAmount)}` : ""}`;

const todayPH = () => new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);

// Settings › Discounts: what the counter can offer at checkout.
export default function DiscountsForm() {
  const { data: discounts = [], isLoading, mutate } = useSWR<DiscountDTO[]>("/api/discounts");
  const { data: stores = [] } = useSWR<Branch[]>("/api/stores");
  const branches = stores.filter((s) => s.isActive !== false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const branchNames = (ids: string[]) => ids.map((id) => branches.find((b) => b.id === id)?.name).filter(Boolean).join(", ");

  const toggleActive = async (d: DiscountDTO) => {
    setBusyId(d.id);
    setMessage(null);
    const res = await fetch(`/api/discounts/${d.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !d.isActive }),
    });
    const data = await res.json();
    if (!res.ok) setMessage(data.error ?? "Couldn't update the discount.");
    await mutate();
    setBusyId(null);
  };

  const remove = async (d: DiscountDTO) => {
    if (!confirm(`Remove the ${d.name} discount?`)) return;
    setBusyId(d.id);
    setMessage(null);
    const res = await fetch(`/api/discounts/${d.id}`, { method: "DELETE" });
    const data = await res.json();
    setMessage(res.ok ? data.message ?? `${d.name} removed.` : data.error ?? "Couldn't remove the discount.");
    await mutate();
    setBusyId(null);
  };

  const today = todayPH();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-zinc-500">These appear as buttons at checkout. Turn one off to hide it without losing its history.</p>
        <button
          onClick={() => setDraft({ ...EMPTY })}
          className="flex items-center gap-2 rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
        >
          <Plus className="h-4 w-4" /> Add discount
        </button>
      </div>
      {message && <p className="rounded-lg bg-zinc-50 px-3 py-2 text-sm text-zinc-700">{message}</p>}

      <ul className="divide-y divide-zinc-100 overflow-hidden rounded-2xl border border-zinc-200 bg-white">
        {isLoading && discounts.length === 0 && <li className="px-4 py-8 text-center text-sm text-zinc-400">Loading...</li>}
        {discounts.map((d) => {
          const expired = d.endsOn != null && d.endsOn < today;
          const upcoming = d.startsOn != null && d.startsOn > today;
          return (
            <li key={d.id} className={`flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5 ${d.isActive ? "" : "bg-zinc-50/60"}`}>
              <div className="min-w-0 flex-1">
                <p className={`flex flex-wrap items-center gap-2 text-sm font-semibold ${d.isActive ? "text-zinc-900" : "text-zinc-400"}`}>
                  {d.name}
                  <span className="font-normal text-zinc-500">{rateOf(d)}</span>
                </p>
                <div className="mt-1 flex flex-wrap gap-1.5 text-[11px] font-medium">
                  {d.isSystem && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-zinc-600">
                      <Lock className="h-3 w-3" /> Set by law
                    </span>
                  )}
                  {d.vatExempt && <span className="rounded-full bg-sky-50 px-2 py-0.5 text-sky-700">VAT-exempt</span>}
                  {d.asksForId && <span className="rounded-full bg-violet-50 px-2 py-0.5 text-violet-700">Asks for ID</span>}
                  {d.storeIds.length > 0 && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-800">Only at {branchNames(d.storeIds) || "selected branches"}</span>}
                  {(d.startsOn || d.endsOn) && (
                    <span className={`rounded-full px-2 py-0.5 ${expired ? "bg-red-50 text-red-700" : upcoming ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-700"}`}>
                      {expired ? "Ended " : upcoming ? "Starts " : ""}
                      {d.startsOn && !expired ? formatDate(d.startsOn) : ""}
                      {d.startsOn && d.endsOn && !expired && !upcoming ? " – " : ""}
                      {d.endsOn && !upcoming ? formatDate(d.endsOn) : ""}
                    </span>
                  )}
                </div>
              </div>
              {!d.isSystem && (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => toggleActive(d)}
                    disabled={busyId === d.id}
                    role="switch"
                    aria-checked={d.isActive}
                    aria-label={`${d.isActive ? "Turn off" : "Turn on"} ${d.name}`}
                    className={`relative mr-2 h-6 w-11 shrink-0 rounded-full transition ${d.isActive ? "bg-emerald-600" : "bg-zinc-300"} disabled:opacity-50`}
                  >
                    <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${d.isActive ? "left-[22px]" : "left-0.5"}`} />
                  </button>
                  <button
                    onClick={() =>
                      setDraft({
                        id: d.id,
                        name: d.name,
                        kind: d.kind === "FIXED" ? "FIXED" : "PERCENT",
                        value: String(d.value),
                        maxAmount: d.maxAmount != null ? String(d.maxAmount) : "",
                        vatExempt: d.vatExempt,
                        asksForId: d.asksForId,
                        isActive: d.isActive,
                        startsOn: d.startsOn ?? "",
                        endsOn: d.endsOn ?? "",
                        storeIds: d.storeIds,
                      })
                    }
                    className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
                    aria-label={`Edit ${d.name}`}
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => remove(d)}
                    disabled={busyId === d.id}
                    className="rounded-lg p-2 text-zinc-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                    aria-label={`Remove ${d.name}`}
                  >
                    {busyId === d.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {draft && (
        <DiscountEditor
          draft={draft}
          branches={branches}
          onClose={() => setDraft(null)}
          onSaved={async (msg) => {
            setDraft(null);
            setMessage(msg);
            await mutate();
          }}
        />
      )}
    </div>
  );
}

function DiscountEditor({
  draft: initial,
  branches,
  onClose,
  onSaved,
}: {
  draft: Draft;
  branches: Branch[];
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [d, setD] = useState<Draft>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<Draft>) => setD((prev) => ({ ...prev, ...patch }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(d.id ? `/api/discounts/${d.id}` : "/api/discounts", {
        method: d.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: d.name,
          kind: d.kind,
          value: d.value,
          maxAmount: d.kind === "PERCENT" ? d.maxAmount || null : null,
          vatExempt: d.vatExempt,
          asksForId: d.asksForId,
          isActive: d.isActive,
          startsOn: d.startsOn || null,
          endsOn: d.endsOn || null,
          storeIds: d.storeIds,
        }),
      });
      const data = await res.json();
      if (!res.ok) return setError(data.error ?? "Couldn't save the discount.");
      onSaved(`${data.name} ${d.id ? "updated" : "added"}.`);
    } catch {
      setError("Network error.");
    } finally {
      setSaving(false);
    }
  };

  const input = "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form onSubmit={save} className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4">
          <h2 className="text-lg font-semibold text-zinc-900">{d.id ? "Edit discount" : "Add discount"}</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-600">Name</label>
            <input autoFocus value={d.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Loyalty card, Payday promo" className={input} />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-600">Takes off</label>
            <div className="flex gap-2">
              <div className="flex shrink-0 rounded-lg border border-zinc-300 p-0.5">
                {(["PERCENT", "FIXED"] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => set({ kind: k })}
                    className={`rounded-md px-3 py-1.5 text-sm font-medium ${d.kind === k ? "bg-emerald-600 text-white" : "text-zinc-600 hover:bg-zinc-100"}`}
                  >
                    {k === "PERCENT" ? "Percent" : "Peso amount"}
                  </button>
                ))}
              </div>
              <div className="relative flex-1">
                {d.kind === "FIXED" && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-zinc-400">₱</span>}
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={d.value}
                  onChange={(e) => set({ value: e.target.value })}
                  placeholder={d.kind === "PERCENT" ? "10" : "50.00"}
                  className={`${input} ${d.kind === "FIXED" ? "pl-7" : "pr-8"}`}
                />
                {d.kind === "PERCENT" && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-zinc-400">%</span>}
              </div>
            </div>
          </div>

          {d.kind === "PERCENT" && (
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">Maximum discount (optional)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-zinc-400">₱</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={d.maxAmount}
                  onChange={(e) => set({ maxAmount: e.target.value })}
                  placeholder="No limit"
                  className={`${input} pl-7`}
                />
              </div>
            </div>
          )}

          <div className="space-y-2.5 rounded-xl border border-zinc-200 p-3">
            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" checked={d.vatExempt} onChange={(e) => set({ vatExempt: e.target.checked })} className="mt-0.5 h-4 w-4 accent-emerald-600" />
              <span>
                <span className="font-medium text-zinc-800">VAT-exempt</span>
                <span className="block text-xs text-zinc-500">Removes the 12% VAT first, then applies the discount — like SC/PWD.</span>
              </span>
            </label>
            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" checked={d.asksForId} onChange={(e) => set({ asksForId: e.target.checked })} className="mt-0.5 h-4 w-4 accent-emerald-600" />
              <span>
                <span className="font-medium text-zinc-800">Ask for an ID</span>
                <span className="block text-xs text-zinc-500">Checkout shows fields for the ID number and holder&apos;s name.</span>
              </span>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">Starts (optional)</label>
              <input type="date" value={d.startsOn} onChange={(e) => set({ startsOn: e.target.value })} className={input} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">Ends (optional)</label>
              <input type="date" value={d.endsOn} min={d.startsOn || undefined} onChange={(e) => set({ endsOn: e.target.value })} className={input} />
            </div>
          </div>

          {branches.length > 1 && (
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">Offered at</label>
              <div className="space-y-1.5 rounded-xl border border-zinc-200 p-3 text-sm">
                <label className="flex items-center gap-3">
                  <input type="radio" checked={d.storeIds.length === 0} onChange={() => set({ storeIds: [] })} className="h-4 w-4 accent-emerald-600" />
                  <span className="text-zinc-800">Every branch</span>
                </label>
                <label className="flex items-center gap-3">
                  <input
                    type="radio"
                    checked={d.storeIds.length > 0}
                    onChange={() => set({ storeIds: d.storeIds.length ? d.storeIds : [branches[0].id] })}
                    className="h-4 w-4 accent-emerald-600"
                  />
                  <span className="text-zinc-800">Only these branches</span>
                </label>
                {d.storeIds.length > 0 && (
                  <div className="ml-7 space-y-1.5 pt-1">
                    {branches.map((b) => (
                      <label key={b.id} className="flex items-center gap-2.5 text-zinc-700">
                        <input
                          type="checkbox"
                          checked={d.storeIds.includes(b.id)}
                          onChange={(e) =>
                            set({ storeIds: e.target.checked ? [...d.storeIds, b.id] : d.storeIds.filter((x) => x !== b.id) })
                          }
                          className="h-4 w-4 accent-emerald-600"
                        />
                        {b.name}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          <label className="flex items-center gap-3 text-sm">
            <input type="checkbox" checked={d.isActive} onChange={(e) => set({ isActive: e.target.checked })} className="h-4 w-4 accent-emerald-600" />
            <span className="font-medium text-zinc-800">Available at checkout</span>
          </label>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-zinc-100 bg-zinc-50 px-5 py-3">
          <p className="min-w-0 text-sm text-red-600">{error}</p>
          <div className="flex shrink-0 gap-2">
            <button type="button" onClick={onClose} className="rounded-full border border-zinc-300 px-4 py-2 text-sm text-zinc-700 hover:bg-white">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 rounded-full bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {saving ? "Saving..." : "Save discount"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
