"use client";

import { useCallback, useEffect, useState } from "react";
import { formatDate } from "@/lib/format";

interface Prescription {
  id: string;
  prescriptionNumber: string;
  status: string;
  originalDate: string;
  customer: { firstName: string; lastName: string };
  doctor: { firstName: string; lastName: string };
  items: Array<{ id: string; quantity: number; product: { name: string } }>;
}

const STATUS_TONE: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-700",
  FILLED: "bg-emerald-100 text-emerald-700",
  PARTIAL: "bg-blue-100 text-blue-700",
  CANCELLED: "bg-zinc-100 text-zinc-500",
  EXPIRED: "bg-red-100 text-red-700",
};

export default function PrescriptionsClient() {
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const rx = await fetch("/api/prescriptions").then((r) => r.json());
    setPrescriptions(Array.isArray(rx) ? rx : []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">Prescriptions</h1>
        <p className="mt-1 text-sm text-zinc-500">
          A history of every prescription filled at checkout. New prescriptions are captured directly in the POS when
          a cart contains a prescription-only item — there&apos;s nothing to create here.
        </p>
      </div>

      <div className="mt-6 overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-100 text-left text-xs font-medium uppercase text-zinc-400">
              <th className="px-4 py-3">Rx #</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Doctor</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Items</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-zinc-400">Loading...</td>
              </tr>
            ) : prescriptions.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-zinc-400">
                  No prescriptions yet. They&apos;ll show up here once one is filled at checkout.
                </td>
              </tr>
            ) : (
              prescriptions.map((p) => (
                <tr key={p.id} className="border-b border-zinc-50 last:border-0">
                  <td className="px-4 py-3 font-medium text-zinc-900">{p.prescriptionNumber}</td>
                  <td className="px-4 py-3 text-zinc-600">{p.customer.firstName} {p.customer.lastName}</td>
                  <td className="px-4 py-3 text-zinc-600">Dr. {p.doctor.firstName} {p.doctor.lastName}</td>
                  <td className="px-4 py-3 text-zinc-500">{formatDate(p.originalDate)}</td>
                  <td className="px-4 py-3 text-zinc-500">{p.items.map((i) => `${i.product.name} x${i.quantity}`).join(", ")}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_TONE[p.status] ?? "bg-zinc-100 text-zinc-600"}`}>
                      {p.status}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
