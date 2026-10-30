"use client";

import { useState } from "react";
import { Loader2, Store } from "lucide-react";

export default function BranchSwitcher({
  stores,
  currentStoreId,
  tone = "light",
}: {
  stores: { id: string; name: string }[];
  currentStoreId: string | null;
  tone?: "light" | "dark";
}) {
  const [switching, setSwitching] = useState(false);

  const switchTo = async (storeId: string) => {
    if (storeId === currentStoreId) return;
    setSwitching(true);
    try {
      const res = await fetch("/api/stores/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error ?? "Couldn't switch branch.");
        setSwitching(false);
        return;
      }
      // Full reload so every page and cached list re-reads the new branch's data.
      window.location.reload();
    } catch {
      alert("Network error.");
      setSwitching(false);
    }
  };

  return (
    <label
      className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
        tone === "dark" ? "bg-white/15 text-white" : "border border-zinc-200 bg-white text-zinc-700"
      }`}
      title="Switch branch"
    >
      {switching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Store className="h-3.5 w-3.5" />}
      <select
        value={currentStoreId ?? ""}
        onChange={(e) => switchTo(e.target.value)}
        disabled={switching}
        className={`max-w-[40vw] sm:max-w-64 cursor-pointer truncate bg-transparent outline-none ${tone === "dark" ? "[&>option]:text-zinc-900" : ""}`}
      >
        {!currentStoreId && <option value="">Choose branch</option>}
        {stores.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
    </label>
  );
}
