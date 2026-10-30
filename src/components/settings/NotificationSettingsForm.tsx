"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

interface NotificationSettings {
  emailNotificationsEnabled: boolean;
  saleNotificationsEnabled: boolean;
  lowStockNotificationsEnabled: boolean;
  outOfStockNotificationsEnabled: boolean;
  endOfDaySummaryEnabled: boolean;
  monthlySummaryEnabled: boolean;
  alertRecipientEmails: string | null;
}

const TOGGLES: [keyof NotificationSettings, string][] = [
  ["emailNotificationsEnabled", "Enable email notifications"],
  ["saleNotificationsEnabled", "Notify on new sale"],
  ["lowStockNotificationsEnabled", "Notify on low stock"],
  ["outOfStockNotificationsEnabled", "Notify on out of stock"],
  ["endOfDaySummaryEnabled", "Daily end-of-day summary"],
  ["monthlySummaryEnabled", "Monthly summary"],
];

export default function NotificationSettingsForm() {
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testMessage, setTestMessage] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/settings/notifications")
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          setLoadError(data.error ?? "Failed to load notification settings.");
          return;
        }
        setSettings(data);
      })
      .catch(() => setLoadError("Network error."));
  }, []);

  if (loadError) return <p className="text-sm text-zinc-500">{loadError}</p>;
  if (!settings) return <p className="text-sm text-zinc-400">Loading...</p>;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch("/api/settings/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const data = await res.json();
      if (res.ok) {
        setSettings(data);
        setSaved(true);
      }
    } finally {
      setSaving(false);
    }
  };

  const sendTestEmail = async () => {
    setTesting(true);
    setTestMessage(null);
    try {
      const res = await fetch("/api/notifications/test-email", { method: "POST" });
      const data = await res.json();
      setTestMessage(res.ok ? `Sent to ${data.sentTo.join(", ")}` : data.error);
    } catch {
      setTestMessage("Network error.");
    } finally {
      setTesting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
        <h3 className="text-base font-semibold text-zinc-900">Recipients</h3>
        <p className="mt-1 text-sm text-zinc-500">Who receives alert emails.</p>
        <label className="mt-6 block text-sm">
          <span className="mb-1.5 block font-medium text-zinc-700">Alert recipient emails (comma separated)</span>
          <input
            value={settings.alertRecipientEmails ?? ""}
            onChange={(e) => setSettings({ ...settings, alertRecipientEmails: e.target.value })}
            placeholder="owner@example.com, manager@example.com"
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
          />
          <span className="mt-1.5 block text-xs text-zinc-500">Leave blank to use the workspace owner&apos;s email.</span>
        </label>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
        <h3 className="text-base font-semibold text-zinc-900">Alerts</h3>
        <p className="mt-1 text-sm text-zinc-500">Choose which events send an email.</p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {TOGGLES.map(([field, label]) => (
            <label
              key={field}
              className="flex cursor-pointer items-center gap-3 rounded-xl border border-zinc-200 px-4 py-3 text-sm text-zinc-700 transition hover:border-emerald-200 hover:bg-emerald-50/40"
            >
              <input
                type="checkbox"
                checked={Boolean(settings[field])}
                onChange={(e) => setSettings({ ...settings, [field]: e.target.checked })}
                className="h-4 w-4 accent-emerald-600"
              />
              {label}
            </label>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-3">
        {saved && <span className="text-sm text-emerald-600">Saved.</span>}
        {testMessage && <span className="text-sm text-zinc-500">{testMessage}</span>}
        <button
          type="button"
          onClick={sendTestEmail}
          disabled={testing}
          className="flex items-center justify-center gap-2 rounded-full border border-zinc-200 bg-white px-5 py-2.5 text-sm font-semibold text-zinc-700 shadow-sm hover:border-zinc-300 disabled:opacity-60 btn-press"
        >
          {testing && <Loader2 className="h-4 w-4 animate-spin" />}
          {testing ? "Sending..." : "Send test email"}
        </button>
        <button
          type="submit"
          disabled={saving}
          className="flex items-center justify-center gap-2 rounded-full bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500 disabled:opacity-60 btn-press"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {saving ? "Saving..." : "Save notification settings"}
        </button>
      </div>
    </form>
  );
}
