"use client";

import { useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { KeyRound, Loader2 } from "lucide-react";

// Settings › User access: "Require a security code". Shown only on the Empire
// plan with more than one branch; off until the owner turns it on.
export default function StaffCodeSetting() {
  const { data, mutate } = useSWR<{ available: boolean; enabled: boolean; usersWithoutCode: number }>("/api/settings/staff-code");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!data?.available) return null;

  const toggle = async () => {
    const next = !data.enabled;
    if (next && data.usersWithoutCode > 0) {
      const ok = confirm(
        `${data.usersWithoutCode} active user${data.usersWithoutCode === 1 ? " doesn't" : "s don't"} have a security code yet. They won't be able to send orders or complete sales until you set one in Users. Turn it on anyway?`
      );
      if (!ok) return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/settings/staff-code", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled: next }) });
      const body = await res.json();
      if (!res.ok) setError(body.error ?? "Couldn't save.");
      await mutate();
    } catch {
      setError("Network error.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
      <div className="flex items-start gap-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
          <KeyRound className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold text-zinc-900">Require a security code to send orders and complete sales</h3>
          <p className="mt-1 text-sm text-zinc-500">
            For counters where one login is shared. Each person enters their own security code when they press Send to cashier or
            Complete Sale, and the order or sale is recorded as theirs, whichever account is logged in. Set each user&apos;s code in{" "}
            <Link href="/users" className="font-medium text-emerald-700 hover:underline">
              Users
            </Link>
            .
          </p>
          {data.usersWithoutCode > 0 && (
            <p className="mt-2 text-xs text-amber-700">
              {data.usersWithoutCode} active user{data.usersWithoutCode === 1 ? " has" : "s have"} no security code yet.
            </p>
          )}
          {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={data.enabled}
          aria-label="Require a security code"
          onClick={toggle}
          disabled={saving}
          className={`relative mt-1 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-60 ${data.enabled ? "bg-emerald-600" : "bg-zinc-300"}`}
        >
          {saving ? (
            <Loader2 className="mx-auto h-4 w-4 animate-spin text-white" />
          ) : (
            <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${data.enabled ? "translate-x-5" : "translate-x-0.5"}`} />
          )}
        </button>
      </div>
    </div>
  );
}
