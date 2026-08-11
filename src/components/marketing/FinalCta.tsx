import Link from "next/link";
import { ArrowRight } from "lucide-react";

export default function FinalCta({ isAuthenticated }: { isAuthenticated: boolean }) {
  return (
    <section className="py-24">
      <div className="mx-auto max-w-4xl rounded-3xl bg-zinc-900 px-8 py-16 text-center shadow-2xl">
        <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
          {isAuthenticated ? "Ready to get back to work?" : "Ready to modernize your drugstore?"}
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-zinc-300">
          {isAuthenticated
            ? "Jump back into your dashboard to keep managing sales, inventory, and reports."
            : "Join the drugstores that have already switched to Nookly. 14-day free trial, no credit card, no setup fee."}
        </p>
        <div className="mt-8 flex justify-center">
          <Link
            href={isAuthenticated ? "/dashboard" : "/signup"}
            className="inline-flex items-center gap-2 rounded-full bg-emerald-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-500/30 transition hover:bg-emerald-400"
          >
            {isAuthenticated ? "Go to Dashboard" : "Get started now"}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}
