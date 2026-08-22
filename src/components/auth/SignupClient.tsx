"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Leaf, Loader2 } from "lucide-react";
import UsernameField from "@/components/shared/UsernameField";

const planLabels: Record<string, string> = {
  sprout: "Sprout — ₱899/mo",
  bloom: "Bloom — ₱2,499/mo",
  empire: "Empire — ₱4,999/mo",
};

function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialPlan = searchParams.get("plan") ?? "sprout";

  const [form, setForm] = useState({
    businessName: "",
    addressLine1: "",
    city: "",
    contactNumber: "",
    ownerFirstName: "",
    ownerLastName: "",
    ownerEmail: "",
    username: "",
    password: "",
    confirmPassword: "",
    planCode: initialPlan.toUpperCase(),
    agreedToTerms: false,
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (form.password !== form.confirmPassword) {
      setError("Passwords don't match.");
      return;
    }
    if (!form.agreedToTerms) {
      setError("Please agree to the Terms of Service and Privacy Policy to continue.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [key]: value }));

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-6 py-12">
      <div className="w-full max-w-md">
        <Link href="/" className="mb-8 flex items-center justify-center gap-2 font-bold text-zinc-900">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-600 text-white">
            <Leaf className="h-4.5 w-4.5" />
          </span>
          Nookly
        </Link>
        <div className="rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
          <h1 className="text-xl font-semibold text-zinc-900">Start your free trial</h1>
          <p className="mt-1 text-sm text-zinc-500">14 days, no credit card required.</p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-5">
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700">Plan</label>
              <select
                value={form.planCode}
                onChange={(e) => set("planCode", e.target.value)}
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
              >
                {Object.entries(planLabels).map(([code, label]) => (
                  <option key={code} value={code.toUpperCase()}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-3 border-t border-zinc-100 pt-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Pharmacy</p>
              <div>
                <label className="mb-1 block text-sm font-medium text-zinc-700">Pharmacy name</label>
                <input
                  required
                  value={form.businessName}
                  onChange={(e) => set("businessName", e.target.value)}
                  placeholder="Kendall's Pharmacy"
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-zinc-700">Address</label>
                <input
                  required
                  value={form.addressLine1}
                  onChange={(e) => set("addressLine1", e.target.value)}
                  placeholder="123 Rizal St."
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-zinc-700">City</label>
                  <input
                    required
                    value={form.city}
                    onChange={(e) => set("city", e.target.value)}
                    className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-zinc-700">Contact number</label>
                  <input
                    required
                    type="tel"
                    value={form.contactNumber}
                    onChange={(e) => set("contactNumber", e.target.value)}
                    placeholder="09XX XXX XXXX"
                    className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-3 border-t border-zinc-100 pt-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Your account</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-zinc-700">First name</label>
                  <input
                    required
                    value={form.ownerFirstName}
                    onChange={(e) => set("ownerFirstName", e.target.value)}
                    className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-zinc-700">Last name</label>
                  <input
                    required
                    value={form.ownerLastName}
                    onChange={(e) => set("ownerLastName", e.target.value)}
                    className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-zinc-700">Email</label>
                <input
                  required
                  type="email"
                  value={form.ownerEmail}
                  onChange={(e) => set("ownerEmail", e.target.value)}
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                />
              </div>
              <UsernameField
                value={form.username}
                onChange={(v) => set("username", v)}
                hint={{ businessSlug: form.businessName, firstName: form.ownerFirstName, lastName: form.ownerLastName }}
              />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-zinc-700">Password</label>
                  <input
                    required
                    type="password"
                    minLength={8}
                    value={form.password}
                    onChange={(e) => set("password", e.target.value)}
                    className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-zinc-700">Confirm password</label>
                  <input
                    required
                    type="password"
                    minLength={8}
                    value={form.confirmPassword}
                    onChange={(e) => set("confirmPassword", e.target.value)}
                    className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>
            </div>

            <label className="flex items-start gap-2 text-sm text-zinc-600">
              <input
                type="checkbox"
                checked={form.agreedToTerms}
                onChange={(e) => set("agreedToTerms", e.target.checked)}
                className="mt-0.5"
              />
              <span>
                I agree to Nookly&apos;s{" "}
                <Link href="/terms" target="_blank" className="font-medium text-emerald-700 underline">
                  Terms of Service
                </Link>{" "}
                and{" "}
                <Link href="/privacy" target="_blank" className="font-medium text-emerald-700 underline">
                  Privacy Policy
                </Link>
                .
              </span>
            </label>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="btn-press flex w-full items-center justify-center gap-2 rounded-full bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-60"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {loading ? "Creating workspace..." : "Create my Nookly workspace"}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-zinc-500">
            Already have an account?{" "}
            <Link href="/login" className="font-medium text-emerald-700">
              Log in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function SignupClient() {
  return (
    <Suspense fallback={null}>
      <SignupForm />
    </Suspense>
  );
}
