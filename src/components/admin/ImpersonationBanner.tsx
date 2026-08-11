"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldAlert } from "lucide-react";

export default function ImpersonationBanner() {
  const router = useRouter();
  const [state, setState] = useState<{ impersonating: boolean; tenantName?: string | null } | null>(null);
  const [stopping, setStopping] = useState(false);

  useEffect(() => {
    fetch("/api/nk-ops-72fq9/impersonate/status")
      .then((res) => res.json())
      .then(setState)
      .catch(() => setState({ impersonating: false }));
  }, []);

  if (!state?.impersonating) return null;

  const handleStop = async () => {
    setStopping(true);
    try {
      const res = await fetch("/api/nk-ops-72fq9/impersonate/stop", { method: "POST" });
      if (res.ok) {
        router.push("/nk-ops-72fq9");
        router.refresh();
      }
    } finally {
      setStopping(false);
    }
  };

  return (
    <div className="flex items-center justify-center gap-3 bg-red-600 px-4 py-2 text-sm font-medium text-white">
      <ShieldAlert className="h-4 w-4" />
      <span>
        Viewing as <strong>{state.tenantName ?? "this tenant"}</strong> — platform admin impersonation session.
      </span>
      <button
        onClick={handleStop}
        disabled={stopping}
        className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold text-white transition hover:bg-white/25 disabled:opacity-60"
      >
        {stopping ? "Returning..." : "Return to admin"}
      </button>
    </div>
  );
}
