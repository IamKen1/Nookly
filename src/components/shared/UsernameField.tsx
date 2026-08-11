"use client";

import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";

export default function UsernameField({
  value,
  onChange,
  hint,
  label = "Username",
  placeholder,
  required = true,
}: {
  value: string;
  onChange: (value: string) => void;
  hint?: { businessSlug?: string; firstName?: string; lastName?: string };
  label?: string;
  placeholder?: string;
  required?: boolean;
}) {
  const [status, setStatus] = useState<"idle" | "checking" | "available" | "taken">("idle");
  const [suggestions, setSuggestions] = useState<string[]>([]);

  useEffect(() => {
    if (!value.trim()) {
      setStatus("idle");
      setSuggestions([]);
      return;
    }
    setStatus("checking");
    const t = setTimeout(async () => {
      const params = new URLSearchParams({ username: value });
      if (hint?.businessSlug) params.set("businessSlug", hint.businessSlug);
      if (hint?.firstName) params.set("firstName", hint.firstName);
      if (hint?.lastName) params.set("lastName", hint.lastName);
      try {
        const res = await fetch(`/api/username-availability?${params.toString()}`);
        const data = await res.json();
        setStatus(data.available ? "available" : "taken");
        setSuggestions(Array.isArray(data.suggestions) ? data.suggestions : []);
      } catch {
        setStatus("idle");
      }
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, hint?.businessSlug, hint?.firstName, hint?.lastName]);

  return (
    <div>
      {label && <label className="mb-1 block text-sm font-medium text-zinc-700">{label}</label>}
      <div className="relative">
        <input
          required={required}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete="username"
          className="w-full rounded-lg border border-zinc-300 px-3 py-2 pr-8 text-sm outline-none focus:border-emerald-500"
        />
        {status === "available" && (
          <Check className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-emerald-500" />
        )}
        {status === "taken" && <X className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-red-500" />}
      </div>

      {status === "checking" && <p className="mt-1 text-xs text-zinc-400">Checking availability...</p>}
      {status === "available" && <p className="mt-1 text-xs text-emerald-600">Available.</p>}
      {status === "taken" && (
        <div className="mt-1.5">
          <p className="text-xs text-red-600">That username is already taken.</p>
          {suggestions.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => onChange(s)}
                  className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
