"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Loader2, ShieldAlert } from "lucide-react";

export default function ImpersonationBanner() {
  const router = useRouter();
  const pathname = usePathname();
  const [state, setState] = useState<{ impersonating: boolean; tenantName?: string | null } | null>(null);
  const [stopping, setStopping] = useState(false);

  useEffect(() => {
    fetch("/api/nk-ops-72fq9/impersonate/status")
      .then((res) => res.json())
      .then(setState)
      .catch(() => setState({ impersonating: false }));
    // Re-check on every route change (impersonate/stop both navigate right after
    // changing the session cookie, so this is what actually picks up the change —
    // router.refresh() alone doesn't remount this component or refetch its state).
  }, [pathname]);

  if (!state?.impersonating) return null;

  const handleStop = async () => {
    setStopping(true);
    try {
      const res = await fetch("/api/nk-ops-72fq9/impersonate/stop", { method: "POST" });
      if (res.ok) {
        setState({ impersonating: false });
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
        className="flex items-center justify-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold text-white transition hover:bg-white/25 disabled:opacity-60 btn-press"
      >
        {stopping && <Loader2 className="h-4 w-4 animate-spin" />}
        {stopping ? "Returning..." : "Return to admin"}
      </button>
    </div>
  );
}
