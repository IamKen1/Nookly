"use client";

import { useEffect, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { pointsEarnedFor, pointsToPesos } from "@/lib/loyalty-math";

interface LoyaltySettings {
  planHasIt: boolean;
  enabled: boolean;
  pesosPerPoint: number;
  pesoValuePerPoint: number;
}

const peso = (n: number) => `₱${n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const inputClass =
  "w-full rounded-lg border border-zinc-300 bg-white py-2.5 pl-8 pr-3 text-sm text-zinc-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20";

export default function LoyaltySettingsForm() {
  const [settings, setSettings] = useState<LoyaltySettings | null>(null);
  // Kept as text while typing so "0." or "" don't snap back to a number.
  const [earnText, setEarnText] = useState("");
  const [worthText, setWorthText] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/settings/loyalty")
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          setLoadError(data.error ?? "Failed to load loyalty settings.");
          return;
        }
        setSettings(data);
        setEarnText(String(data.pesosPerPoint));
        setWorthText(String(data.pesoValuePerPoint));
      })
      .catch(() => setLoadError("Network error."));
  }, []);

  if (loadError) return <p className="text-sm text-zinc-500">{loadError}</p>;
  if (!settings) return <p className="text-sm text-zinc-400">Loading...</p>;

  if (!settings.planHasIt) {
    return (
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
            <Sparkles className="h-4 w-4" />
          </span>
          <div>
            <h3 className="text-base font-semibold text-zinc-900">Not included in your plan</h3>
            <p className="mt-1 text-sm text-zinc-500">
              Customer profiles and loyalty points aren&apos;t part of your current plan. Upgrade from Plan &amp; billing to unlock them.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const earn = Number(earnText);
  const worth = Number(worthText);
  const ratesValid = Number.isFinite(earn) && earn > 0 && Number.isFinite(worth) && worth > 0;
  const examplePurchase = 500;
  const examplePoints = ratesValid ? pointsEarnedFor(examplePurchase, earn) : 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const res = await fetch("/api/settings/loyalty", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: settings.enabled, pesosPerPoint: earnText, pesoValuePerPoint: worthText }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to save.");
        return;
      }
      setSettings(data);
      setEarnText(String(data.pesosPerPoint));
      setWorthText(String(data.pesoValuePerPoint));
      setSaved(true);
    } catch {
      setError("Network error.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
        <label className="flex cursor-pointer items-start justify-between gap-4">
          <span>
            <span className="block text-base font-semibold text-zinc-900">Use loyalty points</span>
            <span className="mt-1 block text-sm text-zinc-500">
              Customers earn points on what they pay and can use them to pay for later purchases. Turning this off keeps
              everyone&apos;s points; they come back when you turn it on again.
            </span>
          </span>
          <input
            type="checkbox"
            checked={settings.enabled}
            onChange={(e) => {
              setSettings({ ...settings, enabled: e.target.checked });
              setSaved(false);
            }}
            className="mt-1 h-5 w-5 shrink-0 accent-emerald-600"
          />
        </label>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
        <h3 className="text-base font-semibold text-zinc-900">Points rates</h3>
        <p className="mt-1 text-sm text-zinc-500">
          Changing a rate applies to new sales only. Past receipts keep the rate they were made with.
        </p>
        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1.5 block font-medium text-zinc-700">Earning: amount paid for 1 point</span>
            <span className="relative block">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400">₱</span>
              <input
                inputMode="decimal"
                value={earnText}
                onChange={(e) => {
                  setEarnText(e.target.value);
                  setSaved(false);
                }}
                className={inputClass}
              />
            </span>
            <span className="mt-1.5 block text-xs text-zinc-500">Points are rounded down. Only cash or e-wallet payments earn points.</span>
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block font-medium text-zinc-700">Using: value of 1 point</span>
            <span className="relative block">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400">₱</span>
              <input
                inputMode="decimal"
                value={worthText}
                onChange={(e) => {
                  setWorthText(e.target.value);
                  setSaved(false);
                }}
                className={inputClass}
              />
            </span>
            <span className="mt-1.5 block text-xs text-zinc-500">Points are used like cash at checkout. Totals and VAT don&apos;t change.</span>
          </label>
        </div>

        <div className="mt-6 rounded-xl bg-emerald-50/60 px-4 py-3 text-sm text-emerald-900">
          {ratesValid ? (
            <>
              A {peso(examplePurchase)} purchase earns <strong>{examplePoints} {examplePoints === 1 ? "point" : "points"}</strong>.{" "}
              {examplePoints > 0 && (
                <>
                  Those {examplePoints} points are worth <strong>{peso(pointsToPesos(examplePoints, worth))}</strong> on a later purchase.
                </>
              )}
            </>
          ) : (
            "Enter amounts greater than zero."
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-3">
        {error && <span className="text-sm text-red-600">{error}</span>}
        {saved && <span className="text-sm text-emerald-600">Saved.</span>}
        <button
          type="submit"
          disabled={saving || !ratesValid}
          className="flex items-center justify-center gap-2 rounded-full bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500 disabled:opacity-60 btn-press"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {saving ? "Saving..." : "Save loyalty settings"}
        </button>
      </div>
    </form>
  );
}
