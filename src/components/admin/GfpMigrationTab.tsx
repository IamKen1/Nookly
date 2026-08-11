"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface TenantOption {
  id: string;
  name: string;
  slug: string;
}

interface TableResult {
  table: string;
  created: number;
  updated: number;
  failed: number;
  errors: string[];
}

interface MigrationSummary {
  tenantId: string;
  storeId: string;
  tables: TableResult[];
  startedAt: string;
  finishedAt: string;
}

export default function GfpMigrationTab() {
  const [tenants, setTenants] = useState<TenantOption[]>([]);
  const [tenantId, setTenantId] = useState("");
  const [loadingTenants, setLoadingTenants] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<MigrationSummary | null>(null);

  useEffect(() => {
    fetch("/api/nk-ops-72fq9/tenants")
      .then((r) => r.json())
      .then((data) => setTenants(Array.isArray(data) ? data : []))
      .finally(() => setLoadingTenants(false));
  }, []);

  const run = async () => {
    if (!tenantId) return;
    const tenant = tenants.find((t) => t.id === tenantId);
    if (!confirm(`Migrate all current gfp-pos data into "${tenant?.name}"? This can be run again later to re-sync updates.`)) return;

    setRunning(true);
    setError(null);
    setSummary(null);
    try {
      const res = await fetch("/api/nk-ops-72fq9/migrate-gfp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Migration failed.");
        return;
      }
      setSummary(data);
    } catch {
      setError("Network error.");
    } finally {
      setRunning(false);
    }
  };

  const totalCreated = summary?.tables.reduce((s, t) => s + t.created, 0) ?? 0;
  const totalUpdated = summary?.tables.reduce((s, t) => s + t.updated, 0) ?? 0;
  const totalFailed = summary?.tables.reduce((s, t) => s + t.failed, 0) ?? 0;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-amber-800/40 bg-amber-950/20 p-4">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
          <div className="text-sm text-amber-200/90">
            <p className="font-semibold text-amber-300">Migrate gfp-pos data</p>
            <p className="mt-1 text-amber-200/70">
              Pulls the <strong>current, live</strong> data from the legacy gfp-pos database — products, categories,
              suppliers, customers, doctors, prescriptions, sales, sale items, stock movements, staff accounts (with
              their existing login working as-is), and settings — into the tenant you choose below. Existing rows
              (matched by their original gfp-pos ID) are updated, not duplicated, so it's safe to run again anytime
              gfp-pos data changes.
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-2 rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        <div>
          <label className="mb-1 block text-xs text-zinc-500">Target tenant</label>
          <select
            value={tenantId}
            onChange={(e) => setTenantId(e.target.value)}
            disabled={loadingTenants}
            className="w-64 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white outline-none focus:border-zinc-500"
          >
            <option value="">Select a tenant...</option>
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.slug})
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={run}
          disabled={!tenantId || running}
          className="flex items-center gap-1.5 rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${running ? "animate-spin" : ""}`} />
          {running ? "Migrating..." : "Run migration"}
        </button>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {summary && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
              <p className="text-xs uppercase text-zinc-500">Created</p>
              <p className="mt-1 text-2xl font-semibold text-emerald-400">{totalCreated}</p>
            </div>
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
              <p className="text-xs uppercase text-zinc-500">Updated</p>
              <p className="mt-1 text-2xl font-semibold text-blue-400">{totalUpdated}</p>
            </div>
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
              <p className="text-xs uppercase text-zinc-500">Failed</p>
              <p className="mt-1 text-2xl font-semibold text-red-400">{totalFailed}</p>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-left text-xs uppercase text-zinc-500">
                  <th className="px-4 py-2">Table</th>
                  <th className="px-4 py-2">Created</th>
                  <th className="px-4 py-2">Updated</th>
                  <th className="px-4 py-2">Failed</th>
                  <th className="px-4 py-2">Errors</th>
                </tr>
              </thead>
              <tbody>
                {summary.tables.map((t) => (
                  <tr key={t.table} className="border-b border-zinc-800/60 last:border-0">
                    <td className="px-4 py-2.5 font-medium text-zinc-200">{t.table}</td>
                    <td className="px-4 py-2.5 text-emerald-400">{t.created}</td>
                    <td className="px-4 py-2.5 text-blue-400">{t.updated}</td>
                    <td className="px-4 py-2.5 text-red-400">{t.failed}</td>
                    <td className="px-4 py-2.5 text-xs text-zinc-500">{t.errors.join("; ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
