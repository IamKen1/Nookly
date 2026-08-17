"use client";

import { useEffect, useState } from "react";

interface AdminRow {
  userId: string;
  email: string;
  name: string;
  tenantName: string;
  tenantSlug: string;
  envProtected: boolean;
}

export default function AdminsTab({ currentAdminEmail }: { currentAdminEmail: string }) {
  const [admins, setAdmins] = useState<AdminRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [tenantSlug, setTenantSlug] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [granting, setGranting] = useState(false);

  // showLoading only applies to the initial fetch — refreshing after a
  // grant/revoke must not flash the whole table back to "Loading...".
  const load = async (showLoading = false) => {
    if (showLoading) setLoading(true);
    const res = await fetch("/api/nk-ops-72fq9/admins");
    const data = await res.json();
    setAdmins(Array.isArray(data) ? data : []);
    if (showLoading) setLoading(false);
  };

  useEffect(() => {
    load(true);
  }, []);

  const grant = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setGranting(true);
    try {
      const res = await fetch("/api/nk-ops-72fq9/admins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantSlug, identifier }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to grant admin access.");
        return;
      }
      setTenantSlug("");
      setIdentifier("");
      load();
    } finally {
      setGranting(false);
    }
  };

  const revoke = async (row: AdminRow) => {
    if (!row.userId) return;
    if (!confirm(`Revoke platform admin access for ${row.email}?`)) return;
    setBusyId(row.userId);
    setError(null);
    try {
      const res = await fetch(`/api/nk-ops-72fq9/admins/${row.userId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to revoke.");
        return;
      }
      load();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <form onSubmit={grant} className="flex flex-wrap items-end gap-2 rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        <div>
          <label className="mb-1 block text-xs text-zinc-500">Tenant slug</label>
          <input
            required
            value={tenantSlug}
            onChange={(e) => setTenantSlug(e.target.value)}
            placeholder="e.g. lemon-drugstore"
            className="w-48 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white outline-none focus:border-zinc-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-500">User email or username</label>
          <input
            required
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            placeholder="owner@example.com"
            className="w-56 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white outline-none focus:border-zinc-500"
          />
        </div>
        <button
          type="submit"
          disabled={granting}
          className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
        >
          {granting ? "Granting..." : "Grant admin access"}
        </button>
      </form>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-left text-xs uppercase text-zinc-500">
              <th className="px-4 py-3">Admin</th>
              <th className="px-4 py-3">Tenant</th>
              <th className="px-4 py-3">Source</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-zinc-500">Loading...</td></tr>
            ) : admins.length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-zinc-500">No platform admins yet.</td></tr>
            ) : (
              admins.map((a) => (
                <tr key={a.email} className="border-b border-zinc-800/60 last:border-0">
                  <td className="px-4 py-3">
                    <p className="font-medium text-white">{a.name}</p>
                    <p className="text-xs text-zinc-500">
                      {a.email}
                      {a.email.toLowerCase() === currentAdminEmail.toLowerCase() && (
                        <span className="ml-1.5 text-zinc-600">(you)</span>
                      )}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-zinc-400">{a.tenantName}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${a.envProtected ? "bg-blue-500/10 text-blue-400" : "bg-zinc-700/40 text-zinc-300"}`}>
                      {a.envProtected ? "Env bootstrap" : "Granted"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {!a.envProtected && a.userId && (
                      <button
                        onClick={() => revoke(a)}
                        disabled={busyId === a.userId}
                        className="rounded-full border border-red-800 px-3 py-1.5 text-xs font-semibold text-red-400 hover:border-red-600 disabled:opacity-50"
                      >
                        Revoke
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        </div>
      </div>
      <p className="text-xs text-zinc-600">
        Env-bootstrap admins are set via <code className="text-zinc-500">PLATFORM_ADMIN_EMAILS</code> and can&apos;t be revoked from here — remove them from the environment variable instead.
      </p>
    </div>
  );
}
