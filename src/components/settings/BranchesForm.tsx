"use client";

import { useState } from "react";
import useSWR from "swr";
import { Loader2, Plus, Store } from "lucide-react";
import { formatLimit } from "@/lib/plans";

interface Branch {
  id: string;
  name: string;
  code: string;
  address: string | null;
  city: string | null;
  isMainBranch: boolean;
  isActive: boolean;
  userCount: number;
  isCurrent: boolean;
}

const emptyForm = { name: "", address: "", city: "" };

export default function BranchesForm({ maxStores, planName }: { maxStores: number; planName: string }) {
  const { data: branches = [], isLoading: loading, mutate: load } = useSWR<Branch[]>("/api/stores");
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const activeCount = branches.filter((b) => b.isActive).length;
  const atLimit = maxStores !== -1 && activeCount >= maxStores;

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSaving(true);
    try {
      const res = await fetch("/api/stores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to add branch.");
        return;
      }
      setForm(emptyForm);
      setShowForm(false);
      setSuccess(`${data.name} added. Assign staff to it from the Users page.`);
      await load();
    } catch {
      setError("Network error.");
    } finally {
      setSaving(false);
    }
  };

  const rename = async () => {
    if (!editing) return;
    setError(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/stores/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editing.name }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to rename branch.");
        return;
      }
      setEditing(null);
      await load();
    } catch {
      setError("Network error.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-zinc-500">
            {activeCount} / {formatLimit(maxStores)} branches on the {planName} plan. Each branch has its own stock, sales, and shifts.
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          disabled={atLimit}
          className="flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50 btn-press"
        >
          <Plus className="h-4 w-4" /> Add branch
        </button>
      </div>

      {atLimit && (
        <p className="rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-700">
          {maxStores === 1
            ? `The ${planName} plan includes 1 branch. Upgrade to Bloom or Empire to add more branches.`
            : `You've reached the ${maxStores}-branch limit for the ${planName} plan. Upgrade to Empire for unlimited branches.`}
        </p>
      )}
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
      {success && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{success}</p>}

      {showForm && (
        <form onSubmit={add} className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <input
            required
            placeholder="Branch name (e.g., Branch 2 – Poblacion)"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
          />
          <div className="grid grid-cols-2 gap-3">
            <input
              placeholder="Address (optional)"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
            />
            <input
              placeholder="City (optional)"
              value={form.city}
              onChange={(e) => setForm({ ...form, city: e.target.value })}
              className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-700 hover:border-zinc-400"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-60 btn-press"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Save branch
            </button>
          </div>
        </form>
      )}

      <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
        {loading ? (
          <p className="px-4 py-8 text-center text-sm text-zinc-400">Loading...</p>
        ) : (
          branches.map((b) => (
            <div key={b.id} className="flex items-center gap-4 border-b border-zinc-100 px-6 py-4 last:border-0">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                <Store className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                {editing?.id === b.id ? (
                  <div className="flex gap-2">
                    <input
                      autoFocus
                      value={editing.name}
                      onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                      className="w-full rounded-lg border border-zinc-300 px-2 py-1 text-sm"
                    />
                    <button
                      onClick={rename}
                      disabled={saving}
                      className="rounded-full bg-emerald-600 px-3 py-1 text-xs font-semibold text-white disabled:opacity-60"
                    >
                      Save
                    </button>
                    <button onClick={() => setEditing(null)} className="text-xs font-semibold text-zinc-500">
                      Cancel
                    </button>
                  </div>
                ) : (
                  <>
                    <p className="truncate text-sm font-semibold text-zinc-900">
                      {b.name}
                      {b.isMainBranch && <span className="ml-2 rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold text-zinc-500">Main</span>}
                      {b.isCurrent && <span className="ml-1.5 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">You&apos;re here</span>}
                    </p>
                    <p className="truncate text-xs text-zinc-500">
                      {[b.address, b.city].filter(Boolean).join(", ") || "No address"} · {b.userCount} staff
                    </p>
                  </>
                )}
              </div>
              {editing?.id !== b.id && (
                <button onClick={() => setEditing({ id: b.id, name: b.name })} className="text-xs font-semibold text-zinc-500 hover:text-zinc-800">
                  Rename
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
