"use client";

import { useEffect, useState } from "react";
import { Loader2, Copy, Check } from "lucide-react";
import { formatDate } from "@/lib/format";

interface ApiKeySummary {
  id: string;
  name: string;
  keyPrefix: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export default function ApiKeysForm() {
  const [keys, setKeys] = useState<ApiKeySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = async () => {
    const res = await fetch("/api/settings/api-keys");
    const data = await res.json();
    setKeys(Array.isArray(data) ? data : []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Give this key a name (e.g. \"Accounting sync\").");
      return;
    }
    setError(null);
    setCreating(true);
    try {
      const res = await fetch("/api/settings/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to create key.");
        return;
      }
      setRevealedKey(data.rawKey);
      setName("");
      load();
    } finally {
      setCreating(false);
    }
  };

  const revoke = async (id: string) => {
    if (!confirm("Revoke this API key? Anything using it will stop working immediately.")) return;
    await fetch(`/api/settings/api-keys/${id}`, { method: "DELETE" });
    load();
  };

  const copyKey = async () => {
    if (!revealedKey) return;
    await navigator.clipboard.writeText(revealedKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div className="rounded-2xl border border-zinc-200 bg-white p-6">
        <h3 className="font-semibold text-zinc-900">API access</h3>
        <p className="mt-1 text-sm text-zinc-500">
          Read-only keys for pulling your products, inventory, and sales data into external tools (accounting, BI, etc).
          See the{" "}
          <a href="/docs/api" target="_blank" className="font-medium text-emerald-700 underline hover:text-emerald-800">
            API reference
          </a>{" "}
          for endpoints, parameters, and sample responses.
        </p>

        {revealedKey && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p className="text-xs font-medium text-amber-800">
              Copy this key now — you won&apos;t be able to see it again.
            </p>
            <div className="mt-2 flex items-center gap-2">
              <code className="flex-1 truncate rounded-md bg-white px-2 py-1.5 text-xs text-zinc-800">{revealedKey}</code>
              <button
                onClick={copyKey}
                className="flex items-center gap-1 rounded-md border border-amber-300 bg-white px-2 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100 btn-press"
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          </div>
        )}

        <form onSubmit={create} className="mt-4 flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Key name (e.g. Accounting sync)"
            className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={creating}
            className="flex items-center justify-center gap-2 rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-60 btn-press"
          >
            {creating && <Loader2 className="h-4 w-4 animate-spin" />}
            {creating ? "Creating..." : "Generate key"}
          </button>
        </form>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </div>

      <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
        <div className="border-b border-zinc-100 px-4 py-3 text-sm font-semibold text-zinc-900">Active keys</div>
        {loading ? (
          <p className="px-4 py-4 text-center text-sm text-zinc-400">Loading...</p>
        ) : keys.length === 0 ? (
          <p className="px-4 py-4 text-center text-sm text-zinc-400">No API keys yet.</p>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {keys.map((k) => (
                <tr key={k.id} className="border-b border-zinc-50 last:border-0">
                  <td className="px-4 py-3">
                    <p className="text-zinc-900">{k.name}</p>
                    <p className="text-xs text-zinc-400">
                      {k.keyPrefix}••••••• · Created {formatDate(k.createdAt)}
                      {k.lastUsedAt ? ` · Last used ${formatDate(k.lastUsedAt)}` : " · Never used"}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {k.revokedAt ? (
                      <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-500">Revoked</span>
                    ) : (
                      <button
                        onClick={() => revoke(k.id)}
                        className="rounded-full border border-red-200 px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-50 btn-press"
                      >
                        Revoke
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
