"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

export default function LogoutButton() {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  return (
    <button
      onClick={async () => {
        setLoggingOut(true);
        try {
          await fetch("/api/auth/logout", { method: "POST" });
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
  );
}
