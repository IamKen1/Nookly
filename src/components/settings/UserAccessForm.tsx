"use client";

import { useEffect, useState } from "react";
import {
  BarChart3,
  Boxes,
  ClipboardPlus,
  Crown,
  LayoutDashboard,
  LifeBuoy,
  Loader2,
  Package,
  Receipt,
  RotateCcw,
  Settings,
  ShoppingCart,
  Users,
  Wallet,
} from "lucide-react";
import {
  CONFIGURABLE_ROLES,
  DEFAULT_PERMISSIONS,
  PERMISSION_MODULES,
  ROLE_DESCRIPTIONS,
  ROLE_LABELS,
  type ConfigurableRole,
  type PermissionMatrix,
  type PermissionModuleKey,
} from "@/lib/permissions-shared";

// Same icons as the sidebar, so each row reads as the module it controls.
const MODULE_ICONS: Partial<Record<PermissionModuleKey, typeof LayoutDashboard>> = {
  dashboard: LayoutDashboard,
  pos: ShoppingCart,
  products: Package,
  inventory: Boxes,
  prescriptions: ClipboardPlus,
  sales: Receipt,
  reports: BarChart3,
  users: Users,
  shifts: Wallet,
  settings: Settings,
  support: LifeBuoy,
};

const recommended = (): PermissionMatrix =>
  Object.fromEntries(
    CONFIGURABLE_ROLES.map((role) => [
      role,
      Object.fromEntries(PERMISSION_MODULES.map((m) => [m.key, (DEFAULT_PERMISSIONS[role] as readonly string[]).includes(m.key)])),
    ])
  ) as PermissionMatrix;

export default function UserAccessForm() {
  const [matrix, setMatrix] = useState<PermissionMatrix | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
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

  const update = (next: PermissionMatrix) => {
    setMatrix(next);
    setDirty(true);
    setSaved(false);
  };

  const toggle = (role: ConfigurableRole, key: PermissionModuleKey) =>
    update({ ...matrix, [role]: { ...matrix[role], [key]: !matrix[role][key] } });

  const resetAll = () => update(recommended());

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
      setDirty(false);
      setSaved(true);
    } catch {
      setError("Network error.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
        <h3 className="text-base font-semibold text-zinc-900">Which modules each role can use</h3>
        <p className="mt-1 text-sm text-zinc-500">
          Tick a module to give a role access. Untick it and that module disappears from their menu and can&apos;t be opened. The
          indented options fine-tune what they can see or do inside a module, and only apply while the module itself is ticked.
          Changes take effect on their next page load. The owner always has access to everything.
        </p>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <table className="w-full min-w-[780px] table-fixed text-sm">
          <colgroup>
            <col className="w-[250px]" />
            <col span={7} />
          </colgroup>
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50/80">
              <th className="sticky left-0 z-10 bg-zinc-50 px-5 py-4 text-left align-middle text-xs font-semibold uppercase tracking-wide text-zinc-500">Module</th>
              <th className="px-1 py-4 text-center align-middle" title="The owner always has access to everything">
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-zinc-900">
                  <Crown className="h-3.5 w-3.5 text-amber-500" /> Owner
                </span>
              </th>
              {CONFIGURABLE_ROLES.map((role) => (
                <th key={role} className="px-1 py-4 text-center align-middle text-xs font-semibold text-zinc-900" title={ROLE_DESCRIPTIONS[role]}>
                  {ROLE_LABELS[role]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PERMISSION_MODULES.map((m) => {
              const Icon = MODULE_ICONS[m.key];
              const isChild = m.parent !== null;
              return (
                <tr key={m.key} className={`border-b border-zinc-100 last:border-0 ${isChild ? "bg-zinc-50/40" : ""}`}>
                  <td className={`sticky left-0 z-10 py-3 pr-4 ${isChild ? "bg-zinc-50 pl-16" : "bg-white pl-5"}`}>
                    <div className="flex items-start gap-3">
                      {Icon && (
                        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
                          <Icon className="h-4 w-4" />
                        </span>
                      )}
                      <div className="min-w-0">
                        <p className={isChild ? "text-sm text-zinc-700" : "font-semibold text-zinc-900"}>
                          {isChild && <span className="mr-1 text-zinc-300">↳</span>}
                          {m.label}
                        </p>
                        <p className="text-xs leading-snug text-zinc-400">{m.description}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-1 py-3 text-center">
                    <input type="checkbox" checked disabled className="h-4 w-4 accent-emerald-600 opacity-40" aria-label={`Owner: ${m.label}`} />
                  </td>
                  {CONFIGURABLE_ROLES.map((role) => {
                    const parentOff = m.parent !== null && !matrix[role][m.parent];
                    return (
                      <td key={role} className="px-1 py-3 text-center">
                        <input
                          type="checkbox"
                          checked={Boolean(matrix[role]?.[m.key]) && !parentOff}
                          disabled={parentOff}
                          onChange={() => toggle(role, m.key)}
                          title={parentOff ? `Tick ${PERMISSION_MODULES.find((x) => x.key === m.parent)?.label} first` : undefined}
                          aria-label={`${ROLE_LABELS[role]}: ${m.label}`}
                          className="h-4 w-4 cursor-pointer accent-emerald-600 disabled:cursor-not-allowed disabled:opacity-30"
                        />
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="sticky bottom-4 flex flex-wrap items-center justify-end gap-3 rounded-2xl border border-zinc-200 bg-white/95 px-5 py-3 shadow-lg backdrop-blur">
        {error && <p className="mr-auto text-sm text-red-600">{error}</p>}
        {!error && dirty && <p className="mr-auto text-sm text-amber-600">You have unsaved changes.</p>}
        {!error && saved && <p className="mr-auto text-sm text-emerald-600">Saved. Staff see the change on their next page load.</p>}
        <button
          type="button"
          onClick={resetAll}
          className="flex items-center gap-1.5 rounded-full border border-zinc-300 px-4 py-2.5 text-sm font-semibold text-zinc-700 hover:border-zinc-400 btn-press"
        >
          <RotateCcw className="h-4 w-4" /> Reset all to recommended
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !dirty}
          className="flex items-center justify-center gap-2 rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50 btn-press"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {saving ? "Saving..." : "Save access settings"}
        </button>
      </div>
    </div>
  );
}
