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
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-4 rounded-2xl border border-zinc-200 bg-white p-6">
      <div className="grid grid-cols-2 gap-3">
        <label className="col-span-2 text-sm">
          <span className="mb-1 block font-medium text-zinc-700">Store name</span>
          <input value={settings.storeName} onChange={(e) => update("storeName", e.target.value)} className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm" />
        </label>
        <label className="col-span-2 text-sm">
          <span className="mb-1 block font-medium text-zinc-700">Receipt type label</span>
          <input value={settings.receiptTitle} onChange={(e) => update("receiptTitle", e.target.value)} className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm" />
          <span className="mt-1 block text-xs text-zinc-400">
            Printed under the store header, e.g. &quot;Acknowledgement Receipt (AR)&quot;. Nookly isn&apos;t BIR-accredited, so avoid
            &quot;Official Receipt&quot; or &quot;Sales Invoice&quot; here — a fixed non-accreditation notice is always added at the bottom regardless.
          </span>
        </label>
        <label className="col-span-2 text-sm">
          <span className="mb-1 block font-medium text-zinc-700">Address line 1</span>
          <input value={settings.addressLine1} onChange={(e) => update("addressLine1", e.target.value)} className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm" />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-zinc-700">Contact number</span>
          <input value={settings.contactNumber ?? ""} onChange={(e) => update("contactNumber", e.target.value)} className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm" />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-zinc-700">TIN</span>
          <input value={settings.tin ?? ""} onChange={(e) => update("tin", e.target.value)} className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm" />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-zinc-700">Permit number</span>
          <input value={settings.permitNumber ?? ""} onChange={(e) => update("permitNumber", e.target.value)} className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm" />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-zinc-700">Accreditation number</span>
          <input value={settings.accreditationNumber ?? ""} onChange={(e) => update("accreditationNumber", e.target.value)} className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm" />
        </label>
        <label className="col-span-2 text-sm">
          <span className="mb-1 block font-medium text-zinc-700">Footer message</span>
          <input value={settings.footerMessage} onChange={(e) => update("footerMessage", e.target.value)} className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm" />
        </label>
      </div>

      <div className="space-y-2 border-t border-zinc-100 pt-4">
        {(
          [
            ["showVatBreakdown", "Show VAT breakdown"],
            ["showCashierName", "Show cashier name"],
            ["showCustomerName", "Show customer name"],
            ["includeOrderRemarks", "Include order remarks"],
          ] as [keyof ReceiptSettings, string][]
        ).map(([field, label]) => (
          <label key={field} className="flex items-center gap-2 text-sm text-zinc-600">
            <input type="checkbox" checked={Boolean(settings[field])} onChange={(e) => update(field, e.target.checked)} />
            {label}
          </label>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="flex items-center justify-center gap-2 rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-60 btn-press"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {saving ? "Saving..." : "Save receipt settings"}
        </button>
        {saved && <span className="text-sm text-emerald-600">Saved.</span>}
      </div>
    </form>
  );
}
