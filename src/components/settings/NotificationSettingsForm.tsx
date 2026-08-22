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
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-4 rounded-2xl border border-zinc-200 bg-white p-6">
      <label className="text-sm">
        <span className="mb-1 block font-medium text-zinc-700">Alert recipient emails (comma separated)</span>
        <input
          value={settings.alertRecipientEmails ?? ""}
          onChange={(e) => setSettings({ ...settings, alertRecipientEmails: e.target.value })}
          placeholder="owner@example.com, manager@example.com"
          className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
        />
        <span className="mt-1 block text-xs text-zinc-400">Leave blank to use the workspace owner&apos;s email.</span>
      </label>

      <div className="space-y-2 border-t border-zinc-100 pt-4">
        {TOGGLES.map(([field, label]) => (
          <label key={field} className="flex items-center gap-2 text-sm text-zinc-600">
            <input
              type="checkbox"
              checked={Boolean(settings[field])}
              onChange={(e) => setSettings({ ...settings, [field]: e.target.checked })}
            />
            {label}
          </label>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="flex items-center justify-center gap-2 rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-60 btn-press"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {saving ? "Saving..." : "Save notification settings"}
        </button>
        <button
          type="button"
          onClick={sendTestEmail}
          disabled={testing}
          className="flex items-center justify-center gap-2 rounded-full border border-zinc-200 bg-white px-5 py-2.5 text-sm font-semibold text-zinc-700 hover:border-zinc-300 disabled:opacity-60 btn-press"
        >
          {testing && <Loader2 className="h-4 w-4 animate-spin" />}
          {testing ? "Sending..." : "Send test email"}
        </button>
        {saved && <span className="text-sm text-emerald-600">Saved.</span>}
        {testMessage && <span className="text-sm text-zinc-500">{testMessage}</span>}
      </div>
    </form>
  );
}
