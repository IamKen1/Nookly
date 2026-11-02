"use client";

import useSWR from "swr";
import { peso } from "@/lib/format";

type Tab = "stock" | "receiving" | "batches" | "movements" | "branches";

interface Tile {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "good" | "warning" | "critical";
}

const num = (n: number) => n.toLocaleString("en-PH");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function tilesFor(d: any): Tile[] {
  switch (d.tab) {
    case "receiving":
      return [
        { label: "Deliveries", value: num(d.deliveries), hint: `${num(d.units)} units received` },
        { label: "Purchases", value: peso(d.purchases), hint: d.deliveries ? `${peso(d.average)} per delivery` : "No deliveries yet" },
        { label: "Top supplier", value: d.topSupplier?.name ?? "—", hint: d.topSupplier ? peso(d.topSupplier.amount) : undefined },
      ];
    case "batches":
      return [
        { label: "Expired, still on the shelf", value: num(d.expired), hint: `${peso(d.expiredValue)} at cost`, tone: d.expired ? "critical" : "good" },
        { label: "Expiring in 30 days", value: num(d.within30), hint: `${peso(d.within30Value)} at cost`, tone: d.within30 ? "warning" : "default" },
        { label: "Expiring in 31–90 days", value: num(d.within90), hint: `${peso(d.within90Value)} at cost` },
        { label: "Lots with stock", value: num(d.lots) },
      ];
    case "movements":
      return [
        { label: "Received", value: num(d.received), hint: "Units from suppliers", tone: "good" },
        { label: "Sold", value: num(d.sold), hint: "Units out through sales" },
        { label: "Transferred", value: `+${num(d.transferredIn)} / −${num(d.transferredOut)}`, hint: "In / out between branches" },
        {
          label: "Written off & returned",
          value: num(d.writtenOff + d.returnedToSupplier),
          hint: `${num(d.writtenOff)} expired/damaged · ${num(d.returnedToSupplier)} to suppliers`,
          tone: d.writtenOff ? "warning" : "default",
        },
      ];
    default:
      return [
        { label: "Cost of inventory", value: peso(d.cost), hint: `${num(d.units)} units` },
        { label: "At selling price", value: peso(d.retail), hint: `${peso(d.retail - d.cost)} potential profit`, tone: "good" },
        { label: "Products in stock", value: `${num(d.productsInStock)} of ${num(d.productCount)}`, hint: "Active products" },
        {
          label: "Low / out of stock",
          value: `${num(d.low)} / ${num(d.out)}`,
          hint: "At or below minimum / none left",
          tone: d.out ? "critical" : d.low ? "warning" : "good",
        },
      ];
  }
}

const SUBTITLE: Record<Tab, string> = {
  stock: "Right now",
  receiving: "Last 30 days",
  batches: "Lots on the shelf right now",
  movements: "Last 30 days",
  branches: "Right now, every branch",
};

// Analytics for the open Inventory tab: this branch, or all branches on the All branches tab.
export default function InventoryAnalytics({ tab, branchName }: { tab: Tab; branchName: string | null }) {
  const { data, isLoading } = useSWR(`/api/inventory/analytics?tab=${tab}`, { keepPreviousData: true });
  const ready = data && data.tab === tab;
  const tiles = ready ? tilesFor(data) : [];
  const scope = tab === "branches" ? "All branches" : branchName ?? "This branch";

  return (
    <section className="mt-4" aria-label="Inventory analytics">
      <p className="mb-2 text-xs text-zinc-500">
        <span className="font-semibold text-zinc-700">{scope}</span> · {SUBTITLE[tab]}
      </p>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {!ready
          ? Array.from({ length: 4 }, (_, i) => <div key={i} className={`h-[86px] rounded-2xl border border-zinc-200 bg-white ${isLoading ? "animate-pulse" : ""}`} />)
          : tiles.map((t) => {
              const tone = { default: "text-zinc-900", good: "text-emerald-700", warning: "text-amber-700", critical: "text-red-600" }[t.tone ?? "default"];
              return (
                <div key={t.label} className="min-w-0 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                  <p className="truncate text-xs font-medium text-zinc-500">{t.label}</p>
                  <p className={`mt-0.5 truncate text-lg font-semibold tabular-nums ${tone}`}>{t.value}</p>
                  {t.hint && <p className="mt-0.5 truncate text-xs text-zinc-400">{t.hint}</p>}
                </div>
              );
            })}
      </div>

      {ready && tab === "branches" && data.branches?.length > 0 && (
        <div className="mt-3 overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-zinc-100 text-left text-xs font-medium uppercase text-zinc-400">
                <th className="px-4 py-2.5">Branch</th>
                <th className="px-4 py-2.5 text-right">Cost of inventory</th>
                <th className="px-4 py-2.5 text-right">Units</th>
                <th className="px-4 py-2.5 text-right">Low / out</th>
                <th className="px-4 py-2.5 text-right">Expiring ≤90 days</th>
                <th className="px-4 py-2.5 text-right">Expired value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {data.branches.map((b: any) => (
                <tr key={b.id}>
                  <td className="px-4 py-2.5 text-zinc-800">{b.name}</td>
                  <td className="px-4 py-2.5 text-right font-medium tabular-nums text-zinc-900">{peso(b.cost)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-zinc-600">{num(b.units)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    <span className={b.low ? "text-amber-700" : "text-zinc-400"}>{b.low}</span>
                    <span className="text-zinc-300"> / </span>
                    <span className={b.out ? "font-semibold text-red-600" : "text-zinc-400"}>{b.out}</span>
                  </td>
                  <td className={`px-4 py-2.5 text-right tabular-nums ${b.expiringSoon ? "text-amber-700" : "text-zinc-400"}`}>{b.expiringSoon}</td>
                  <td className={`px-4 py-2.5 text-right tabular-nums ${b.expiredValue ? "font-semibold text-red-600" : "text-zinc-400"}`}>{peso(b.expiredValue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
