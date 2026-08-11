const steps = [
  {
    step: "01",
    title: "Sign up in under 2 minutes",
    description: "Set up your pharmacy name, choose a plan, and you're ready — no setup fee.",
  },
  {
    step: "02",
    title: "Import your products",
    description: "Upload via spreadsheet or add manually. Pharmacy and general items are auto-categorized.",
  },
  {
    step: "03",
    title: "Start selling",
    description: "Open the POS on any device, scan, and watch sales show up on the dashboard right away.",
  },
];

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="bg-zinc-50 py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl">
            Live in a single day
          </h2>
        </div>
        <div className="mt-16 grid gap-8 sm:grid-cols-3">
          {steps.map(({ step, title, description }) => (
            <div key={step} className="relative rounded-2xl bg-white p-6 shadow-sm">
              <span className="text-4xl font-bold text-emerald-100">{step}</span>
              <h3 className="mt-3 font-semibold text-zinc-900">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-zinc-600">{description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
