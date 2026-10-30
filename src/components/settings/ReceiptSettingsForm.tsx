"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

interface ReceiptSettings {
  storeName: string;
  receiptTitle: string;
  addressLine1: string;
  addressLine2: string | null;
  contactNumber: string | null;
  tin: string | null;
  permitNumber: string | null;
  accreditationNumber: string | null;
  serialNumberLabel: string | null;
  footerMessage: string;
  showVatBreakdown: boolean;
  showCashierName: boolean;
  showCustomerName: boolean;
  includeOrderRemarks: boolean;
}

export default function ReceiptSettingsForm() {
  const [settings, setSettings] = useState<ReceiptSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/settings/receipt")
      .then((res) => res.json())
      .then(setSettings);
  }, []);

  if (!settings) return <p className="text-sm text-zinc-400">Loading...</p>;

  const update = (field: keyof ReceiptSettings, value: string | boolean) => setSettings({ ...settings, [field]: value });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch("/api/settings/receipt", {
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

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
        <h3 className="text-base font-semibold text-zinc-900">Store details</h3>
        <p className="mt-1 text-sm text-zinc-500">Shown at the top of every receipt.</p>
        <div className="mt-6 grid gap-5 sm:grid-cols-2">
        <label className="sm:col-span-2 block text-sm">
          <span className="mb-1.5 block font-medium text-zinc-700">Store name</span>
          <input value={settings.storeName} onChange={(e) => update("storeName", e.target.value)} className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20" />
        </label>
        <label className="sm:col-span-2 block text-sm">
          <span className="mb-1.5 block font-medium text-zinc-700">Receipt type label</span>
          <input value={settings.receiptTitle} onChange={(e) => update("receiptTitle", e.target.value)} className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20" />
          <span className="mt-1.5 block text-xs leading-relaxed text-zinc-500">Printed under the store header, e.g. &quot;Acknowledgement Receipt (AR)&quot;. Nookly isn&apos;t BIR-accredited, so avoid
            &quot;Official Receipt&quot; or &quot;Sales Invoice&quot; here — a fixed non-accreditation notice is always added at the bottom regardless.</span>
        </label>
        <label className="sm:col-span-2 block text-sm">
          <span className="mb-1.5 block font-medium text-zinc-700">Address line 1</span>
          <input value={settings.addressLine1} onChange={(e) => update("addressLine1", e.target.value)} className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20" />
        </label>
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
        <h3 className="text-base font-semibold text-zinc-900">Business registration</h3>
        <p className="mt-1 text-sm text-zinc-500">Optional details printed below the store header.</p>
        <div className="mt-6 grid gap-5 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1.5 block font-medium text-zinc-700">Contact number</span>
          <input value={settings.contactNumber ?? ""} onChange={(e) => update("contactNumber", e.target.value)} className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20" />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block font-medium text-zinc-700">TIN</span>
          <input value={settings.tin ?? ""} onChange={(e) => update("tin", e.target.value)} className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20" />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block font-medium text-zinc-700">Permit number</span>
          <input value={settings.permitNumber ?? ""} onChange={(e) => update("permitNumber", e.target.value)} className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20" />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block font-medium text-zinc-700">Accreditation number</span>
          <input value={settings.accreditationNumber ?? ""} onChange={(e) => update("accreditationNumber", e.target.value)} className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20" />
        </label>
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
        <h3 className="text-base font-semibold text-zinc-900">Receipt content</h3>
        <p className="mt-1 text-sm text-zinc-500">Choose what appears on printed receipts.</p>
        <div className="mt-6 space-y-5">
        <label className="sm:col-span-2 block text-sm">
          <span className="mb-1.5 block font-medium text-zinc-700">Footer message</span>
          <input value={settings.footerMessage} onChange={(e) => update("footerMessage", e.target.value)} className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20" />
        </label>
          <div className="grid gap-3 sm:grid-cols-2">
            {(
              [
                ["showVatBreakdown", "Show VAT breakdown"],
                ["showCashierName", "Show cashier name"],
                ["showCustomerName", "Show customer name"],
                ["includeOrderRemarks", "Include order remarks"],
              ] as [keyof ReceiptSettings, string][]
            ).map(([field, label]) => (
              <label
                key={field}
                className="flex cursor-pointer items-center gap-3 rounded-xl border border-zinc-200 px-4 py-3 text-sm text-zinc-700 transition hover:border-emerald-200 hover:bg-emerald-50/40"
              >
                <input
                  type="checkbox"
                  checked={Boolean(settings[field])}
                  onChange={(e) => update(field, e.target.checked)}
                  className="h-4 w-4 accent-emerald-600"
                />
                {label}
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-3">
        {saved && <span className="text-sm text-emerald-600">Saved.</span>}
        <button
          type="submit"
          disabled={saving}
          className="flex items-center justify-center gap-2 rounded-full bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500 disabled:opacity-60 btn-press"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {saving ? "Saving..." : "Save receipt settings"}
        </button>
      </div>
    </form>
  );
}
