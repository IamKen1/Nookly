"use client";

import { useEffect, useState } from "react";
import type { CartLine } from "./CartPanel";

export interface PrescriptionDraft {
  customerId?: string;
  newCustomer?: { firstName: string; lastName: string; phone?: string };
  doctorId?: string;
  newDoctor?: { firstName: string; lastName: string; licenseNumber?: string };
  writtenDate: string;
  instructions?: string;
  refillsAllowed?: number;
  prescribedQuantities?: Record<string, number>;
}

export interface PrescriptionSelection {
  prescriptionId?: string;
  prescriptionDraft?: PrescriptionDraft;
}

interface PersonMatch {
  id: string;
  firstName: string;
  lastName: string;
}

interface PendingPrescription {
  id: string;
  prescriptionNumber: string;
  status?: string;
  customer: { firstName: string; lastName: string };
}

const todayStr = () => new Date().toISOString().slice(0, 10);

function PersonPicker({
  label,
  placeholder,
  searchUrl,
  extraNewField,
  selected,
  onSelect,
  newValues,
  onNewValuesChange,
  onUnfinishedChange,
}: {
  label: string;
  placeholder: string;
  searchUrl: (q: string) => string;
  extraNewField: { key: "phone" | "licenseNumber"; label: string };
  selected: PersonMatch | null;
  onSelect: (person: PersonMatch | null) => void;
  newValues: { firstName: string; lastName: string; extra: string };
  onNewValuesChange: (values: { firstName: string; lastName: string; extra: string }) => void;
  // Called with true while there's typed text that isn't a chosen or new person yet.
  onUnfinishedChange: (unfinished: boolean) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PersonMatch[]>([]);
  const [creatingNew, setCreatingNew] = useState(false);
  const [searched, setSearched] = useState("");

  const unfinished = creatingNew
    ? Boolean(newValues.firstName.trim() || newValues.lastName.trim() || newValues.extra.trim()) && !(newValues.firstName.trim() && newValues.lastName.trim())
    : !selected && Boolean(query.trim());
  useEffect(() => onUnfinishedChange(unfinished), [unfinished, onUnfinishedChange]);

  // "+ New" starts from whatever was typed in the search box.
  const startNew = () => {
    const parts = query.trim().split(/\s+/).filter(Boolean);
    if (parts.length) onNewValuesChange({ firstName: parts.slice(0, -1).join(" ") || parts[0], lastName: parts.length > 1 ? parts[parts.length - 1] : "", extra: "" });
    setQuery("");
    setCreatingNew(true);
  };

  useEffect(() => {
    if (!query.trim() || selected) {
      setResults([]);
      return;
    }
    const t = setTimeout(() => {
      fetch(searchUrl(query.trim()))
        .then((r) => (r.ok ? r.json() : []))
        .then((data) => {
          setResults(Array.isArray(data) ? data.slice(0, 6) : []);
          setSearched(query.trim());
        })
        .catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(t);
  }, [query, selected, searchUrl]);

  if (creatingNew) {
    return (
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <label className="text-xs font-semibold text-gray-700">{label} (new)</label>
          <button
            type="button"
            onClick={() => {
              // Going back to search drops what was typed here, so it can't be saved by accident.
              onNewValuesChange({ firstName: "", lastName: "", extra: "" });
              setCreatingNew(false);
            }}
            className="text-xs font-medium text-emerald-700 hover:underline"
          >
            Search existing instead
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input
            value={newValues.firstName}
            onChange={(e) => onNewValuesChange({ ...newValues, firstName: e.target.value })}
            placeholder="First name"
            className="rounded-lg border border-gray-300 p-2 text-sm focus:border-emerald-500"
          />
          <input
            value={newValues.lastName}
            onChange={(e) => onNewValuesChange({ ...newValues, lastName: e.target.value })}
            placeholder="Last name"
            className="rounded-lg border border-gray-300 p-2 text-sm focus:border-emerald-500"
          />
        </div>
        <input
          value={newValues.extra}
          onChange={(e) => onNewValuesChange({ ...newValues, extra: e.target.value })}
          placeholder={extraNewField.label}
          className="mt-2 w-full rounded-lg border border-gray-300 p-2 text-sm focus:border-emerald-500"
        />
      </div>
    );
  }

  if (selected) {
    return (
      <div>
        <label className="mb-1.5 block text-xs font-semibold text-gray-700">{label}</label>
        <div className="flex items-center justify-between rounded-lg border border-emerald-300 bg-emerald-50 p-2 text-sm">
          <span className="font-medium text-emerald-900">
            {selected.firstName} {selected.lastName}
          </span>
          <button type="button" onClick={() => onSelect(null)} className="text-xs font-medium text-emerald-700 hover:underline">
            Change
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <label className="text-xs font-semibold text-gray-700">{label}</label>
        <button type="button" onClick={startNew} className="text-xs font-medium text-emerald-700 hover:underline">
          + New {label.toLowerCase()}
        </button>
      </div>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-gray-300 p-2 text-sm focus:border-emerald-500"
      />
      {results.length > 0 && (
        <div className="mt-1 max-h-32 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-sm">
          {results.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => {
                onSelect(r);
                setQuery("");
                setResults([]);
              }}
              className="block w-full px-3 py-2 text-left text-sm hover:bg-emerald-50"
            >
              {r.firstName} {r.lastName}
            </button>
          ))}
        </div>
      )}
      {query.trim() && !selected && (
        <p className="mt-1 text-xs text-amber-800">
          {searched === query.trim() && results.length === 0 ? `No ${label.toLowerCase()} named “${query.trim()}”. ` : "Pick a name from the list, or "}
          <button type="button" onClick={startNew} className="font-semibold text-emerald-700 underline">
            add “{query.trim()}” as a new {label.toLowerCase()}
          </button>
          . Only a chosen or newly added {label.toLowerCase()} is saved.
        </p>
      )}
    </div>
  );
}

export default function PrescriptionFields({
  pendingPrescriptions,
  cart = [],
  initialExistingId,
  onChange,
  onIncompleteChange,
}: {
  pendingPrescriptions: PendingPrescription[];
  cart?: CartLine[];
  // Opens on "Existing / refill" with this prescription chosen (from Reorder).
  initialExistingId?: string;
  onChange: (selection: PrescriptionSelection | null) => void;
  // A message while the prescription is started but can't be saved yet; null when it's complete or untouched.
  onIncompleteChange?: (message: string | null) => void;
}) {
  const [mode, setMode] = useState<"new" | "existing">(initialExistingId ? "existing" : "new");
  const [existingId, setExistingId] = useState(initialExistingId ?? "");
  // The items this prescription covers (Rx-flagged ones if any, else the whole
  // cart) and how many of each were prescribed — more than bought now means
  // it stays "partially served" until the rest is bought.
  const flagged = cart.filter((l) => l.requiresPrescription);
  const rxLines = flagged.length > 0 ? flagged : cart;
  const [prescribed, setPrescribed] = useState<Record<string, string>>({});

  const [customer, setCustomer] = useState<PersonMatch | null>(null);
  const [newCustomer, setNewCustomer] = useState({ firstName: "", lastName: "", extra: "" });
  const [doctor, setDoctor] = useState<PersonMatch | null>(null);
  const [newDoctor, setNewDoctor] = useState({ firstName: "", lastName: "", extra: "" });
  const [writtenDate, setWrittenDate] = useState(todayStr());
  const [instructions, setInstructions] = useState("");
  const [refillsAllowed, setRefillsAllowed] = useState(0);
  const [customerUnfinished, setCustomerUnfinished] = useState(false);
  const [doctorUnfinished, setDoctorUnfinished] = useState(false);

  useEffect(() => {
    if (mode === "existing") {
      onChange(existingId ? { prescriptionId: existingId } : null);
      return;
    }

    const hasCustomer = Boolean(customer || (newCustomer.firstName.trim() && newCustomer.lastName.trim()));
    const hasDoctor = Boolean(doctor || (newDoctor.firstName.trim() && newDoctor.lastName.trim()));
    if (!hasCustomer || !hasDoctor || !writtenDate) {
      onChange(null);
      return;
    }
    if (customerUnfinished || doctorUnfinished) {
      onChange(null);
      return;
    }

    onChange({
      prescriptionDraft: {
        customerId: customer?.id,
        newCustomer: customer
          ? undefined
          : { firstName: newCustomer.firstName.trim(), lastName: newCustomer.lastName.trim(), phone: newCustomer.extra.trim() || undefined },
        doctorId: doctor?.id,
        newDoctor: doctor
          ? undefined
          : { firstName: newDoctor.firstName.trim(), lastName: newDoctor.lastName.trim(), licenseNumber: newDoctor.extra.trim() || undefined },
        writtenDate,
        instructions: instructions.trim() || undefined,
        refillsAllowed,
        prescribedQuantities: Object.fromEntries(
          rxLines.map((l) => [l.productId, Math.max(l.quantity, parseInt(prescribed[l.productId] ?? "", 10) || l.quantity)])
        ),
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, existingId, customer, newCustomer, doctor, newDoctor, writtenDate, instructions, refillsAllowed, customerUnfinished, doctorUnfinished, prescribed, cart]);

  // Started but not finished: checkout waits instead of silently dropping it.
  useEffect(() => {
    if (!onIncompleteChange) return;
    if (mode === "existing") return onIncompleteChange(null);
    const hasCustomer = Boolean(customer || (newCustomer.firstName.trim() && newCustomer.lastName.trim()));
    const hasDoctor = Boolean(doctor || (newDoctor.firstName.trim() && newDoctor.lastName.trim()));
    const touched = hasCustomer || hasDoctor || customerUnfinished || doctorUnfinished || Boolean(instructions.trim());
    if (!touched) return onIncompleteChange(null);
    if (customerUnfinished || !hasCustomer) return onIncompleteChange("Prescription: choose the customer from the list or add them as new — or clear it.");
    if (doctorUnfinished || !hasDoctor) return onIncompleteChange("Prescription: choose the doctor from the list or add them as new — or clear it.");
    onIncompleteChange(null);
  }, [mode, customer, newCustomer, doctor, newDoctor, instructions, customerUnfinished, doctorUnfinished, onIncompleteChange]);

  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-3">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">Prescription (optional)</h3>
        {pendingPrescriptions.length > 0 && (
          <div className="flex gap-1 rounded-full bg-white p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setMode("new")}
              className={`rounded-full px-2.5 py-1 font-medium ${mode === "new" ? "bg-emerald-600 text-white" : "text-gray-600"}`}
            >
              New Rx
            </button>
            <button
              type="button"
              onClick={() => setMode("existing")}
              className={`rounded-full px-2.5 py-1 font-medium ${mode === "existing" ? "bg-emerald-600 text-white" : "text-gray-600"}`}
            >
              Existing / refill
            </button>
          </div>
        )}
      </div>

      {mode === "existing" ? (
        <select
          value={existingId}
          onChange={(e) => setExistingId(e.target.value)}
          className="w-full rounded-lg border border-amber-300 bg-white p-2.5 text-sm"
        >
          <option value="">Select prescription...</option>
          {pendingPrescriptions.map((p) => (
            <option key={p.id} value={p.id}>
              {p.prescriptionNumber} — {p.customer.firstName} {p.customer.lastName}
              {p.status === "PARTIAL" ? " (partially served)" : ""}
            </option>
          ))}
        </select>
      ) : (
        <div className="space-y-3">
          <PersonPicker
            label="Customer"
            placeholder="Search customer by name..."
            searchUrl={(q) => `/api/customers?search=${encodeURIComponent(q)}`}
            extraNewField={{ key: "phone", label: "Phone (optional)" }}
            selected={customer}
            onSelect={setCustomer}
            newValues={newCustomer}
            onNewValuesChange={setNewCustomer}
            onUnfinishedChange={setCustomerUnfinished}
          />
          <PersonPicker
            label="Doctor"
            placeholder="Search doctor by name..."
            searchUrl={(q) => `/api/doctors?search=${encodeURIComponent(q)}`}
            extraNewField={{ key: "licenseNumber", label: "License no. (optional)" }}
            selected={doctor}
            onSelect={setDoctor}
            newValues={newDoctor}
            onNewValuesChange={setNewDoctor}
            onUnfinishedChange={setDoctorUnfinished}
          />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-700">Date written</label>
              <input
                type="date"
                value={writtenDate}
                onChange={(e) => setWrittenDate(e.target.value)}
                max={todayStr()}
                className="w-full rounded-lg border border-gray-300 p-2 text-sm focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-700">Refills allowed</label>
              <input
                type="number"
                min={0}
                value={refillsAllowed}
                onChange={(e) => setRefillsAllowed(Math.max(0, Number(e.target.value) || 0))}
                className="w-full rounded-lg border border-gray-300 p-2 text-sm focus:border-emerald-500"
              />
            </div>
          </div>
          {rxLines.length > 0 && (
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-700">Prescribed quantity</label>
              <ul className="space-y-1.5">
                {rxLines.map((l) => (
                  <li key={l.productId} className="flex items-center justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate text-gray-700">
                      {l.name} <span className="text-xs text-gray-400">· buying {l.quantity} now</span>
                    </span>
                    <input
                      type="number"
                      min={l.quantity}
                      value={prescribed[l.productId] ?? String(l.quantity)}
                      onChange={(e) => setPrescribed((prev) => ({ ...prev, [l.productId]: e.target.value }))}
                      aria-label={`Prescribed quantity of ${l.name}`}
                      className="w-20 shrink-0 rounded-lg border border-gray-300 p-1.5 text-right text-sm focus:border-emerald-500"
                    />
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-[11px] text-gray-500">If the doctor prescribed more than the customer buys now, it stays partially served until the rest is bought.</p>
            </div>
          )}
          <input
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="Dosage instructions (optional)"
            className="w-full rounded-lg border border-gray-300 p-2 text-sm focus:border-emerald-500"
          />
        </div>
      )}
    </div>
  );
}
