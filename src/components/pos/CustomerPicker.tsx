"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { Search, UserPlus, X } from "lucide-react";

export interface PickedCustomer {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  loyaltyPoints: number;
}

// Find a customer by name or phone, or add one on the spot, at checkout.
export default function CustomerPicker({
  value,
  onChange,
  pesoValuePerPoint,
}: {
  value: PickedCustomer | null;
  onChange: (customer: PickedCustomer | null) => void;
  pesoValuePerPoint: number;
}) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ firstName: "", lastName: "", phone: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);

  const { data: results = [], isLoading } = useSWR<PickedCustomer[]>(
    !value && debounced.length >= 2 ? `/api/customers?search=${encodeURIComponent(debounced)}` : null
  );

  const pointsLabel = (points: number) =>
    `${points.toLocaleString("en-PH")} pts (₱${(points * pesoValuePerPoint).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`;

  const addCustomer = async () => {
    if (!form.firstName.trim() || !form.lastName.trim()) {
      setError("Enter the customer's first and last name.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName: form.firstName.trim(), lastName: form.lastName.trim(), phone: form.phone.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Couldn't add the customer.");
        return;
      }
      onChange({ id: data.id, firstName: data.firstName, lastName: data.lastName, phone: data.phone, loyaltyPoints: data.loyaltyPoints ?? 0 });
      setAdding(false);
      setForm({ firstName: "", lastName: "", phone: "" });
      setQuery("");
    } catch {
      setError("Network error.");
    } finally {
      setSaving(false);
    }
  };

  if (value) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-emerald-900">
            {value.firstName} {value.lastName}
          </p>
          <p className="text-xs text-emerald-700">
            {value.phone ? `${value.phone} · ` : ""}
            {pointsLabel(value.loyaltyPoints)}
          </p>
        </div>
        <button type="button" onClick={() => onChange(null)} className="p-1 text-emerald-700 hover:text-emerald-900" title="Remove customer">
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  if (adding) {
    const input = "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20";
    return (
      <div className="space-y-2 rounded-lg border border-gray-200 p-3">
        <div className="grid grid-cols-2 gap-2">
          <input autoFocus value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} placeholder="First name" className={input} />
          <input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} placeholder="Last name" className={input} />
        </div>
        <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Mobile number (optional)" inputMode="tel" className={input} />
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => { setAdding(false); setError(null); }} className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-700">
            Cancel
          </button>
          <button type="button" onClick={addCustomer} disabled={saving} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
            {saving ? "Adding..." : "Add customer"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name or mobile number"
            className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
          />
        </div>
        <button
          type="button"
          onClick={() => {
            const [first, ...rest] = query.trim().split(/\s+/);
            const looksLikePhone = /^[\d+\s-]{6,}$/.test(query.trim());
            setForm(looksLikePhone ? { firstName: "", lastName: "", phone: query.trim() } : { firstName: first ?? "", lastName: rest.join(" "), phone: "" });
            setAdding(true);
          }}
          className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 text-xs font-medium text-gray-700 hover:border-gray-400"
        >
          <UserPlus className="h-4 w-4" />
          New
        </button>
      </div>
      {debounced.length >= 2 && (
        <div className="mt-1 max-h-48 overflow-y-auto rounded-lg border border-gray-200 bg-white">
          {isLoading ? (
            <p className="px-3 py-2 text-xs text-gray-400">Searching...</p>
          ) : results.length === 0 ? (
            <p className="px-3 py-2 text-xs text-gray-500">No customer found. Use New to add them.</p>
          ) : (
            results.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  onChange(c);
                  setQuery("");
                }}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-emerald-50"
              >
                <span className="min-w-0 truncate">
                  {c.firstName} {c.lastName}
                  {c.phone && <span className="ml-2 text-xs text-gray-500">{c.phone}</span>}
                </span>
                <span className="shrink-0 text-xs font-medium text-emerald-700">{c.loyaltyPoints.toLocaleString("en-PH")} pts</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
