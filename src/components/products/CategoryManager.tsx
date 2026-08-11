"use client";

import { useState } from "react";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";

export interface CategoryRow {
  id: string;
  name: string;
}

export default function CategoryManager({
  categories,
  onClose,
  onChanged,
}: {
  categories: CategoryRow[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const flashSuccess = (message: string) => {
    setSuccessMessage(message);
    setTimeout(() => setSuccessMessage(null), 2000);
  };

  const addCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to add category.");
        return;
      }
      setNewName("");
      flashSuccess("Category added.");
      onChanged();
    } finally {
      setSaving(false);
    }
  };

  const saveRename = async (id: string) => {
    if (!editingName.trim()) return;
    setError(null);
    setBusyId(id);
    try {
      const res = await fetch(`/api/categories/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editingName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to rename category.");
        return;
      }
      setEditingId(null);
      flashSuccess("Renamed.");
      onChanged();
    } finally {
      setBusyId(null);
    }
  };

  const deactivate = async (id: string) => {
    if (!confirm("Deactivate this category?")) return;
    setError(null);
    setBusyId(id);
    try {
      const res = await fetch(`/api/categories/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to deactivate category.");
        return;
      }
      flashSuccess("Category deactivated.");
      onChanged();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-900">Manage categories</h2>
          <button onClick={onClose}>
            <X className="h-5 w-5 text-zinc-400" />
          </button>
        </div>

        <form onSubmit={addCategory} className="mt-4 flex gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New category name"
            className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" /> Add
          </button>
        </form>

        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        {successMessage && <p className="mt-2 text-sm text-emerald-600">{successMessage}</p>}

        <ul className="mt-4 max-h-72 space-y-1 overflow-y-auto">
          {categories.map((c) => (
            <li key={c.id} className="flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-zinc-50">
              {editingId === c.id ? (
                <div className="flex flex-1 items-center gap-2">
                  <input
                    autoFocus
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    className="flex-1 rounded border border-zinc-300 px-2 py-1 text-sm"
                  />
                  <button
                    onClick={() => saveRename(c.id)}
                    disabled={busyId === c.id}
                    className="text-emerald-600 hover:text-emerald-700 disabled:opacity-40"
                  >
                    <Check className={`h-4 w-4 ${busyId === c.id ? "animate-pulse" : ""}`} />
                  </button>
                  <button onClick={() => setEditingId(null)} disabled={busyId === c.id} className="text-zinc-400 hover:text-zinc-600 disabled:opacity-40">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <>
                  <span className="text-sm text-zinc-700">{c.name}</span>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => {
                        setEditingId(c.id);
                        setEditingName(c.name);
                      }}
                      disabled={busyId === c.id}
                      className="text-zinc-400 hover:text-zinc-700 disabled:opacity-40"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => deactivate(c.id)}
                      disabled={busyId === c.id}
                      className="text-zinc-400 hover:text-red-600 disabled:opacity-40"
                    >
                      <Trash2 className={`h-3.5 w-3.5 ${busyId === c.id ? "animate-pulse" : ""}`} />
                    </button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
