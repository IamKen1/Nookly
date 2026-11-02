"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

export default function LogoutButton() {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const [blocked, setBlocked] = useState<string | null>(null);
  return (
    <span className="relative inline-flex items-center gap-3">
    {blocked && (
      <span className="text-xs font-medium text-amber-700">
        {blocked}{" "}
        <a href="/pos" className="font-semibold text-emerald-700 underline">
          Go to POS
        </a>
      </span>
    )}
    <button
      onClick={async () => {
        setLoggingOut(true);
        setBlocked(null);
        try {
          const res = await fetch("/api/auth/logout", { method: "POST" });
          if (!res.ok) {
            // e.g. this role must end its shift before logging out
            setBlocked((await res.json().catch(() => ({}))).error ?? "Couldn't log out.");
            return;
          }
          router.push("/login");
          router.refresh();
        } finally {
          setLoggingOut(false);
        }
      }}
      disabled={loggingOut}
      className="flex items-center justify-center gap-2 text-sm font-medium text-zinc-500 hover:text-zinc-900 disabled:opacity-60 btn-press"
    >
      {loggingOut && <Loader2 className="h-4 w-4 animate-spin" />}
      Log out
    </button>
    </span>
  );
}
