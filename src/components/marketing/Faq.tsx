const faqs = [
  {
    q: "Is there a free trial?",
    a: "Yes, 14 days free on every plan, no credit card required. You can cancel anytime before the trial ends.",
  },
  {
    q: "Can I switch plans later?",
    a: "Yes, you can upgrade or downgrade anytime from your dashboard. Billing is prorated automatically.",
  },
  {
    q: "What if I already have a lot of existing products/inventory?",
    a: "We support bulk import via Excel/CSV from day one, so you don't have to type everything in one by one.",
  },
  {
    q: "Does it handle VAT and Senior/PWD discounts?",
    a: "Yes — VAT breakdown, Senior/PWD discount computation, and your store details are all configured and printed on official receipts.",
  },
  {
    q: "Where is our data hosted?",
    a: "On secure cloud infrastructure with daily backups. Every pharmacy (tenant) is isolated and its data kept protected.",
  },
];

export default function Faq() {
  return (
    <section id="faq" className="py-24 sm:py-32">
      <div className="mx-auto max-w-3xl px-6">
        <h2 className="text-center text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl">
          Frequently asked questions
        </h2>
        <div className="mt-12 divide-y divide-zinc-200 rounded-2xl border border-zinc-200">
          {faqs.map(({ q, a }) => (
            <details key={q} className="group p-6 open:bg-zinc-50">
              <summary className="flex cursor-pointer list-none items-center justify-between font-medium text-zinc-900">
                {q}
                <span className="ml-4 text-zinc-400 transition group-open:rotate-45">+</span>
              </summary>
              <p className="mt-3 text-sm leading-6 text-zinc-600">{a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
