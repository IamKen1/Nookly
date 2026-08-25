"use client";

import { useState } from "react";
import { Check, Sparkles } from "lucide-react";

type BillingCycle = "monthly" | "yearly";

export interface PlanView {
  code: string;
  name: string;
  tagline: string;
  priceMonthly: number;
  priceYearly: number;
  features: string[];
}

const peso = (value: number) => `₱${value.toLocaleString("en-PH")}`;

export default function PricingSection({ isAuthenticated, plans }: { isAuthenticated: boolean; plans: PlanView[] }) {
  const [cycle, setCycle] = useState<BillingCycle>("monthly");
  const highlightCode = plans[1]?.code;

  return (
    <section id="pricing" className="relative py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
            <Sparkles className="h-3.5 w-3.5" /> 14-day free trial, no credit card
          </span>
          <h2 className="mt-4 text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl">
            Simple pricing that grows with your business
          </h2>
          <p className="mt-4 text-lg text-zinc-600">
            Start with one branch, upgrade when you need to. Cancel anytime.
          </p>
        </div>

        <div className="mt-10 flex justify-center">
          <div className="inline-flex items-center rounded-full border border-zinc-200 bg-zinc-50 p-1">
            <button
              type="button"
              onClick={() => setCycle("monthly")}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
                cycle === "monthly"
                  ? "bg-white text-zinc-900 shadow-sm"
                  : "text-zinc-500 hover:text-zinc-700"
              }`}
            >
              Monthly
            </button>
            <button
              type="button"
              onClick={() => setCycle("yearly")}
              className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition ${
                cycle === "yearly"
                  ? "bg-white text-zinc-900 shadow-sm"
                  : "text-zinc-500 hover:text-zinc-700"
              }`}
            >
              Yearly
              <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                2 months free
              </span>
            </button>
          </div>
        </div>

        <div className="mt-12 grid gap-6 sm:mt-16 lg:grid-cols-3">
          {plans.map((plan) => {
            // In yearly mode, the amount actually billed is the yearly total
            // — that must be the prominent number, not the /mo breakdown,
            // or customers don't notice what they're really committing to.
            const monthlyEquivalent = Math.round(plan.priceYearly / 12);
            const price = cycle === "monthly" ? plan.priceMonthly : plan.priceYearly;
            const highlight = plan.code === highlightCode;
            return (
              <div
                key={plan.code}
                className={`relative flex flex-col rounded-3xl border p-8 ${
                  highlight
                    ? "border-emerald-600 bg-zinc-900 text-white shadow-xl shadow-emerald-900/20 lg:-translate-y-3"
                    : "border-zinc-200 bg-white"
                }`}
              >
                {highlight && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-emerald-500 px-3 py-1 text-xs font-semibold text-white">
                    Most Popular
                  </span>
                )}
                <h3 className={`text-lg font-semibold ${highlight ? "text-white" : "text-zinc-900"}`}>
                  {plan.name}
                </h3>
                <p className={`mt-1 text-sm ${highlight ? "text-zinc-300" : "text-zinc-500"}`}>
                  {plan.tagline}
                </p>

                <div className="mt-6 flex items-baseline gap-1">
                  <span className="text-4xl font-bold tracking-tight">{peso(price)}</span>
                  <span className={highlight ? "text-zinc-400" : "text-zinc-500"}>{cycle === "monthly" ? "/mo" : "/year"}</span>
                </div>
                {cycle === "yearly" && (
                  <p className={`mt-1 text-xs ${highlight ? "text-zinc-400" : "text-zinc-500"}`}>
                    that&apos;s {peso(monthlyEquivalent)}/mo — 2 months free
                  </p>
                )}

                <a
                  href={isAuthenticated ? "/dashboard" : `/signup?plan=${plan.code.toLowerCase()}&cycle=${cycle}`}
                  className={`mt-6 inline-flex items-center justify-center rounded-full px-5 py-2.5 text-sm font-semibold transition ${
                    highlight
                      ? "bg-emerald-500 text-white hover:bg-emerald-400"
                      : "bg-zinc-900 text-white hover:bg-zinc-800"
                  }`}
                >
                  {isAuthenticated ? "Go to Dashboard" : "Start free trial"}
                </a>

                <ul className="mt-8 space-y-3 text-sm">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2.5">
                      <Check
                        className={`mt-0.5 h-4 w-4 shrink-0 ${
                          highlight ? "text-emerald-400" : "text-emerald-600"
                        }`}
                      />
                      <span className={highlight ? "text-zinc-200" : "text-zinc-600"}>{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        <p className="mt-10 text-center text-sm text-zinc-500">
          Need a custom plan for 10+ branches?{" "}
          <a href="mailto:hello@nookly.app" className="font-medium text-emerald-700 underline underline-offset-2">
            Let&apos;s talk
          </a>
          .
        </p>
      </div>
    </section>
  );
}
