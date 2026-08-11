const faqs = [
  {
    q: "Is there a free trial?",
    a: "Yes — 14 days free on every plan, no credit card required. You can cancel anytime before the trial ends.",
  },
  {
    q: "How do I upgrade or downgrade my plan?",
    a: "Request a plan change from Settings → Plan. We don't charge cards automatically — our team reaches out to confirm and collect payment, then activates the new plan for you. No surprise charges.",
  },
  {
    q: "Are your receipts BIR-accredited Official Receipts?",
    a: "Not yet. Nookly prints Acknowledgement Receipts (AR), and every receipt carries a clear notice that it isn't a BIR-accredited Official Receipt or Sales Invoice. You remain responsible for your own tax compliance in the meantime.",
  },
  {
    q: "What if I already have existing products and inventory?",
    a: "You can bulk import via Excel/CSV from day one, and if you're moving from another Kendall's-style POS system, ask us about a direct data migration — products, sales history, customers, prescriptions, and staff accounts can be brought over in one go.",
  },
  {
    q: "Does it handle VAT and Senior/PWD discounts?",
    a: "Yes — VAT breakdown, Senior/PWD/Student/Employee discount computation, and your store details are all configured in Settings and printed on receipts automatically.",
  },
  {
    q: "Can Nookly handle prescriptions?",
    a: "Yes, on the Bloom plan and above. When a cart contains a prescription-only item, the cashier fills in the customer, doctor, and prescription details right there at checkout — no separate paperwork step, and refill prescriptions can be reused directly.",
  },
  {
    q: "How does cash handling work for cashiers?",
    a: "Shifts are optional but built in: a cashier can declare a starting cash float, check a live sales reading anytime, and count cash at end-of-shift to see if the drawer is over, short, or balanced. Supervisors get a daily closing report across every cashier's shift.",
  },
  {
    q: "Do you support GCash or other e-wallet cash-in/cash-out services?",
    a: "Yes. Cash-in and cash-out transactions (GCash, Maya, etc.) are logged separately from product sales, with their service fee tracked as extra income, and they automatically factor into the shift's cash reconciliation.",
  },
  {
    q: "What kind of reports do I get?",
    a: "Sales dashboards, income statements, and inventory valuation, plus daily/weekly/monthly/yearly trend views for sales and cash — with CSV export for your bookkeeper.",
  },
  {
    q: "Can I run more than one branch?",
    a: "Yes, on Bloom (up to 3 branches) and Empire (unlimited). Each branch tracks its own stock and staff while sharing one workspace, one set of reports, and one login system.",
  },
  {
    q: "What if I run into a problem or have a question?",
    a: "Use \"Report a problem\" right inside the app (under Support) — it goes straight to our team as a ticket, and you'll see our replies in the same thread.",
  },
  {
    q: "Is my data safe and separate from other pharmacies using Nookly?",
    a: "Yes — every workspace's data is logically isolated and every request is scoped to your account. Access by Nookly staff for support purposes is limited and logged.",
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
