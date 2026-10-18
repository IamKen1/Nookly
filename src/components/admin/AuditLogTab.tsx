"use client";

import { useEffect, useState } from "react";
import { formatDateTime } from "@/lib/format";

interface AuditLogRow {
  id: string;
  actorEmail: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

const ACTION_TONE: Record<string, string> = {
  unlock_success: "text-emerald-600",
  unlock_failed: "text-red-600",
  suspend_tenant: "text-amber-600",
  reactivate_tenant: "text-emerald-600",
  impersonate_tenant: "text-blue-600",
  stop_impersonate: "text-blue-600",
  grant_admin: "text-emerald-600",
  revoke_admin: "text-red-600",
  lock_console: "text-zinc-500",
  plan_request_activated: "text-emerald-600",
  plan_request_cancelled: "text-red-600",
};

export default function AuditLogTab() {
  const [logs, setLogs] = useState<AuditLogRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/nk-ops-72fq9/audit-log")
      .then((res) => res.json())
      .then((data) => setLogs(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
      <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-200 text-left text-xs uppercase text-zinc-500">
            <th className="px-4 py-3">When</th>
            <th className="px-4 py-3">Actor</th>
            <th className="px-4 py-3">Action</th>
            <th className="px-4 py-3">Target</th>
            <th className="px-4 py-3">Details</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={5} className="px-4 py-8 text-center text-zinc-500">Loading...</td></tr>
          ) : logs.length === 0 ? (
            <tr><td colSpan={5} className="px-4 py-8 text-center text-zinc-500">No activity recorded yet.</td></tr>
          ) : (
            logs.map((l) => (
              <tr key={l.id} className="border-b border-zinc-100 last:border-0 align-top">
                <td className="whitespace-nowrap px-4 py-3 text-zinc-500">{formatDateTime(l.createdAt)}</td>
                <td className="px-4 py-3 text-zinc-700">{l.actorEmail}</td>
                <td className={`px-4 py-3 font-medium ${ACTION_TONE[l.action] ?? "text-zinc-700"}`}>{l.action}</td>
                <td className="px-4 py-3 text-zinc-500">{l.targetType ? `${l.targetType}:${l.targetId}` : "—"}</td>
                <td className="max-w-xs truncate px-4 py-3 text-xs text-zinc-400">
                  {l.metadata ? JSON.stringify(l.metadata) : ""}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      </div>
    </div>
  );
}
