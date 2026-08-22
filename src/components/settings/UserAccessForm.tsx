"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { CONFIGURABLE_ROLES, PERMISSION_MODULES, ROLE_LABELS, type PermissionMatrix } from "@/lib/permissions-shared";

export default function UserAccessForm() {
  const [matrix, setMatrix] = useState<PermissionMatrix | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/settings/access-matrix")
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          setLoadError(data.error ?? "Failed to load user access settings.");
          return;
        }
        setMatrix(data);
      })
      .catch(() => setLoadError("Network error."));
  }, []);

  if (loadError) return <p className="text-sm text-zinc-500">{loadError}</p>;
  if (!matrix) return <p className="text-sm text-zinc-400">Loading...</p>;

  const toggle = (role: (typeof CONFIGURABLE_ROLES)[number], moduleKey: (typeof PERMISSION_MODULES)[number]["key"]) => {
    setMatrix({ ...matrix, [role]: { ...matrix[role], [moduleKey]: !matrix[role][moduleKey] } });
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const res = await fetch("/api/settings/access-matrix", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(matrix),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to save.");
        return;
      }
      setMatrix(data);
      setSaved(true);
    } catch {
      setError("Network error.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl space-y-4 rounded-2xl border border-zinc-200 bg-white p-6">
      <div>
        <h3 className="text-sm font-semibold text-zinc-900">Who can do what</h3>
        <p className="mt-1 text-xs text-zinc-500">
          The owner always has full access. Check a box to let staff with that role do that action — uncheck to take it away.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs font-medium uppercase text-zinc-400">
              <th className="py-2 pr-4">Action</th>
              {CONFIGURABLE_ROLES.map((role) => (
                <th key={role} className="px-2 py-2 text-center whitespace-nowrap">
                  {ROLE_LABELS[role]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {PERMISSION_MODULES.map((m) => (
              <tr key={m.key}>
                <td className="py-3 pr-4">
                  <p className="font-medium text-zinc-800">{m.label}</p>
                  <p className="text-xs text-zinc-400">{m.description}</p>
                </td>
                {CONFIGURABLE_ROLES.map((role) => (
                  <td key={role} className="px-2 py-3 text-center">
                    <input
                      type="checkbox"
                      checked={Boolean(matrix[role]?.[m.key])}
                      onChange={() => toggle(role, m.key)}
                      className="h-4 w-4 accent-emerald-600"
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex items-center gap-3 border-t border-zinc-100 pt-4">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="flex items-center justify-center gap-2 rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-60 btn-press"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {saving ? "Saving..." : "Save access settings"}
        </button>
        {saved && <span className="text-sm text-emerald-600">Saved.</span>}
      </div>
    </div>
  );
}
