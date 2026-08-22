"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Leaf, Loader2, User } from "lucide-react";

export default function ForgotPasswordClient() {
  const [identifier, setIdentifier] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier }),
      });
    } finally {
      // Always show the same confirmation, whether or not it succeeded server-side.
      setSubmitted(true);
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-linear-to-b from-emerald-50 via-zinc-50 to-zinc-50 px-6 py-12">
      <div className="w-full max-w-md">
        <Link href="/" className="mb-8 flex items-center justify-center gap-2 font-bold text-zinc-900">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm">
            <Leaf className="h-5 w-5" />
          </span>
          <span className="text-lg">Nookly</span>
        </Link>

        <div className="rounded-2xl border border-zinc-200 bg-white p-8 shadow-xl shadow-zinc-900/5">
          {submitted ? (
            <div className="text-center">
              <h1 className="text-xl font-semibold text-zinc-900">Check your email</h1>
              <p className="mt-2 text-sm text-zinc-500">
                If that username matches an account, we&apos;ve sent a password reset link to the email on file. It
                expires in 30 minutes.
              </p>
              <Link href="/login" className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700 hover:text-emerald-800">
                <ArrowLeft className="h-4 w-4" />
                Back to login
              </Link>
            </div>
          ) : (
            <>
              <h1 className="text-xl font-semibold text-zinc-900">Forgot your password?</h1>
              <p className="mt-1 text-sm text-zinc-500">Enter your username and we&apos;ll send you a reset link.</p>

              <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-zinc-700">Username</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                    <input
                      required
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      autoComplete="username"
                      className="w-full rounded-lg border border-zinc-300 py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="btn-press flex w-full items-center justify-center gap-2 rounded-full bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-500 disabled:opacity-60"
                >
                  {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                  {loading ? "Sending..." : "Send reset link"}
                </button>
              </form>

              <p className="mt-6 text-center text-sm text-zinc-500">
                <Link href="/login" className="font-medium text-emerald-700 hover:text-emerald-800">
                  Back to login
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
