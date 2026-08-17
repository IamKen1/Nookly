"use client";

import { useEffect, useState } from "react";

interface Plan {
  id: string;
  code: string;
  name: string;
  tagline: string | null;
  priceMonthly: number;
  priceYearly: number;
  maxStores: number;
  maxUsers: number;
  maxProducts: number;
  features: string[];
  featureReports: boolean;
  featurePrescriptions: boolean;
  featureAlerts: boolean;
  featureMultiBranch: boolean;
  isActive: boolean;
  tenantCount: number;
}

const FEATURE_FLAGS: { key: keyof Plan; label: string }[] = [
  { key: "featureReports", label: "Reports & analytics" },
  { key: "featurePrescriptions", label: "Prescription management" },
  { key: "featureAlerts", label: "Email alerts & scheduled reports" },
  { key: "featureMultiBranch", label: "Multi-branch stock transfer" },
];

function PlanCard({ plan, onSaved }: { plan: Plan; onSaved: () => void }) {
  const [draft, setDraft] = useState(plan);
  const [featuresText, setFeaturesText] = useState(plan.features.join("\n"));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const set = <K extends keyof Plan>(key: K, value: Plan[K]) => setDraft((d) => ({ ...d, [key]: value }));

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/nk-ops-72fq9/plans/${plan.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: draft.name,
          tagline: draft.tagline,
          priceMonthly: draft.priceMonthly,
          priceYearly: draft.priceYearly,
          maxStores: draft.maxStores,
          maxUsers: draft.maxUsers,
          maxProducts: draft.maxProducts,
          featureReports: draft.featureReports,
          featurePrescriptions: draft.featurePrescriptions,
          featureAlerts: draft.featureAlerts,
          featureMultiBranch: draft.featureMultiBranch,
          isActive: draft.isActive,
          features: featuresText.split("\n").map((f) => f.trim()).filter(Boolean),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to save.");
        return;
      }
      setSavedAt(Date.now());
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{plan.code}</span>
          <p className="text-xs text-zinc-500">{plan.tenantCount} tenants on this plan</p>
        </div>
        <label className="flex items-center gap-2 text-xs text-zinc-400">
          <input type="checkbox" checked={draft.isActive} onChange={(e) => set("isActive", e.target.checked)} />
          Active / visible on pricing page
        </label>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs text-zinc-500">Name</label>
          <input
            value={draft.name}
            onChange={(e) => set("name", e.target.value)}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white outline-none focus:border-zinc-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-500">Tagline</label>
          <input
            value={draft.tagline ?? ""}
            onChange={(e) => set("tagline", e.target.value)}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white outline-none focus:border-zinc-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-500">Price / month (₱)</label>
          <input
            type="number"
            value={draft.priceMonthly}
            onChange={(e) => set("priceMonthly", Number(e.target.value))}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white outline-none focus:border-zinc-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-500">Price / year (₱)</label>
          <input
            type="number"
            value={draft.priceYearly}
            onChange={(e) => set("priceYearly", Number(e.target.value))}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white outline-none focus:border-zinc-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-500">Max branches (-1 = unlimited)</label>
          <input
            type="number"
            value={draft.maxStores}
            onChange={(e) => set("maxStores", Number(e.target.value))}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white outline-none focus:border-zinc-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-500">Max staff (-1 = unlimited)</label>
          <input
            type="number"
            value={draft.maxUsers}
            onChange={(e) => set("maxUsers", Number(e.target.value))}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white outline-none focus:border-zinc-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-500">Max products (-1 = unlimited)</label>
          <input
            type="number"
            value={draft.maxProducts}
            onChange={(e) => set("maxProducts", Number(e.target.value))}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white outline-none focus:border-zinc-500"
          />
        </div>
      </div>

      <div className="mt-4">
        <p className="mb-2 text-xs font-medium text-zinc-500">Feature checklist (controls real access, not just display)</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {FEATURE_FLAGS.map((f) => (
            <label key={f.key} className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-300">
              <input
                type="checkbox"
                checked={Boolean(draft[f.key])}
                onChange={(e) => set(f.key, e.target.checked as never)}
              />
              {f.label}
            </label>
          ))}
        </div>
      </div>

      <div className="mt-4">
        <label className="mb-1 block text-xs text-zinc-500">Pricing page bullet points (one per line)</label>
        <textarea
          rows={6}
          value={featuresText}
          onChange={(e) => setFeaturesText(e.target.value)}
          className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white outline-none focus:border-zinc-500"
        />
      </div>

      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save changes"}
        </button>
        {savedAt && <span className="text-xs text-emerald-400">Saved.</span>}
      </div>
    </div>
  );
}

export default function PlansTab() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);

  // showLoading only applies to the initial fetch. A card's own save() already
  // reflects the just-saved values in its draft state, so the post-save
  // refresh (which only exists to pick up server-computed fields like
  // tenantCount) must not unmount the whole grid — every other card's
  // in-progress edits and scroll position would be discarded for no reason.
  const load = async (showLoading = false) => {
    if (showLoading) setLoading(true);
    const res = await fetch("/api/nk-ops-72fq9/plans");
    const data = await res.json();
    setPlans(Array.isArray(data) ? data : []);
    if (showLoading) setLoading(false);
  };

  useEffect(() => {
    load(true);
  }, []);

  if (loading) return <p className="text-sm text-zinc-500">Loading...</p>;

  return (
    <div className="space-y-4">
      <p className="text-xs text-zinc-500">
        Changes here take effect immediately — feature checkboxes control real access for every tenant on that plan, and
        the bullet points update the public pricing page.
      </p>
      <div className="grid gap-4 lg:grid-cols-3">
        {plans.map((p) => (
          <PlanCard key={p.id} plan={p} onSaved={() => load()} />
        ))}
      </div>
    </div>
  );
}
