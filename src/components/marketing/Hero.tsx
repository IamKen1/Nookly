import Link from "next/link";
import { ArrowRight, ShieldCheck, Star, Store } from "lucide-react";

export default function Hero({ isAuthenticated }: { isAuthenticated: boolean }) {
  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-emerald-50 via-white to-white">
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[560px] w-[900px] -translate-x-1/2 rounded-full bg-emerald-200/40 blur-3xl" />
      <div className="relative mx-auto grid max-w-6xl gap-16 px-6 pb-20 pt-16 sm:pt-24 lg:grid-cols-2 lg:items-center lg:pb-32">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
            <Star className="h-3.5 w-3.5 fill-emerald-500 text-emerald-500" /> Built for Philippine drugstores
          </span>
          <h1 className="mt-5 text-4xl font-bold leading-tight tracking-tight text-zinc-900 sm:text-5xl">
            The cloud POS
            <span className="text-emerald-600"> drugstores </span>
            trust
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-zinc-600">
            One subscription for POS, inventory, prescriptions, and receipts —
            from a single sari-sari pharmacy to a multi-branch chain.
            Setup in minutes, sales insights in real time.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href={isAuthenticated ? "/dashboard" : "/signup"}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-emerald-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-600/25 transition hover:bg-emerald-500"
            >
              {isAuthenticated ? "Go to Dashboard" : "Start your 14-day free trial"}
              <ArrowRight className="h-4 w-4" />
            </Link>
            <a
              href="#pricing"
              className="inline-flex items-center justify-center gap-2 rounded-full border border-zinc-200 bg-white px-6 py-3 text-sm font-semibold text-zinc-700 transition hover:border-zinc-300"
            >
              View pricing
            </a>
          </div>
          <div className="mt-8 flex items-center gap-6 text-sm text-zinc-500">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 text-emerald-600" /> No credit card required
            </span>
            <span className="flex items-center gap-1.5">
              <Store className="h-4 w-4 text-emerald-600" /> Multi-branch ready
            </span>
          </div>
        </div>

        <div className="relative">
          <div className="rounded-3xl border border-zinc-200 bg-white p-4 shadow-2xl shadow-zinc-900/10">
            <div className="flex items-center justify-between rounded-t-2xl bg-zinc-900 px-4 py-3 text-white">
              <span className="text-sm font-semibold">Nookly · Juan Pharmacy</span>
              <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[11px] font-medium text-emerald-300">
                Live
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3 p-4">
              <div className="col-span-2 rounded-xl bg-emerald-50 p-4">
                <p className="text-xs font-medium text-emerald-700">Today&apos;s Sales</p>
                <p className="mt-1 text-2xl font-bold text-emerald-800">₱48,320.50</p>
                <p className="mt-1 text-xs text-emerald-600">+18.2% vs yesterday</p>
              </div>
              <div className="rounded-xl bg-zinc-50 p-4">
                <p className="text-xs font-medium text-zinc-500">Branches</p>
                <p className="mt-1 text-xl font-bold text-zinc-900">3 active</p>
              </div>
              <div className="rounded-xl bg-zinc-50 p-4">
                <p className="text-xs font-medium text-zinc-500">Low stock</p>
                <p className="mt-1 text-xl font-bold text-amber-600">7 items</p>
              </div>
              <div className="col-span-2 space-y-2 rounded-xl border border-zinc-100 p-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-zinc-500">Biogesic 500mg x2</span>
                  <span className="font-medium text-zinc-800">₱24.00</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-zinc-500">Senior discount (20%)</span>
                  <span className="font-medium text-emerald-600">-₱4.80</span>
                </div>
                <div className="flex items-center justify-between border-t border-zinc-100 pt-2 text-sm font-semibold">
                  <span className="text-zinc-900">Total</span>
                  <span className="text-zinc-900">₱19.20</span>
                </div>
              </div>
            </div>
          </div>
          <div className="absolute -bottom-6 -left-6 hidden rounded-2xl border border-zinc-200 bg-white px-4 py-3 shadow-xl sm:block">
            <p className="text-xs text-zinc-500">Prescription filled</p>
            <p className="text-sm font-semibold text-zinc-900">Rx #2026-00481 ✓</p>
          </div>
        </div>
      </div>
    </section>
  );
}
