import {
  BarChart3,
  Building2,
  PackageSearch,
  ReceiptText,
  ScanBarcode,
  Stethoscope,
} from "lucide-react";

const features = [
  {
    icon: ScanBarcode,
    title: "Fast, simple POS",
    description:
      "Barcode scanning, split payments, and senior/PWD discounts computed automatically.",
  },
  {
    icon: Building2,
    title: "Multi-branch inventory",
    description:
      "One dashboard for every branch. Instantly see which store has stock of an item.",
  },
  {
    icon: Stethoscope,
    title: "Prescription management",
    description:
      "Track Rx, doctors, refills, and drug scheduling — compliant with pharmacy regulatory requirements.",
  },
  {
    icon: ReceiptText,
    title: "Detailed official receipts",
    description:
      "VAT breakdown, discount computation, and store details configured per branch, printable on a thermal printer.",
  },
  {
    icon: PackageSearch,
    title: "Smart stock alerts",
    description:
      "Automatic email alerts when a product is running low or about to expire.",
  },
  {
    icon: BarChart3,
    title: "Sales analytics",
    description:
      "Real-time reports per branch, per category, and per cashier — so you know exactly where the money's coming from.",
  },
];

export default function Features() {
  return (
    <section id="features" className="py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl">
            Everything your drugstore needs, in one platform
          </h2>
          <p className="mt-4 text-lg text-zinc-600">
            Built around the actual workflow of a working drugstore — not a generic POS.
          </p>
        </div>
        <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map(({ icon: Icon, title, description }) => (
            <div
              key={title}
              className="rounded-2xl border border-zinc-200 bg-white p-6 transition hover:border-emerald-200 hover:shadow-lg hover:shadow-emerald-900/5"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                <Icon className="h-5.5 w-5.5" />
              </span>
              <h3 className="mt-4 font-semibold text-zinc-900">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-zinc-600">{description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
