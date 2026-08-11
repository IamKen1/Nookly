import { Leaf } from "lucide-react";

export default function Footer() {
  return (
    <footer className="border-t border-zinc-100 py-12">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 sm:flex-row">
        <div className="flex items-center gap-2 font-semibold text-zinc-900">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-600 text-white">
            <Leaf className="h-4 w-4" />
          </span>
          Nookly
        </div>
        <p className="text-sm text-zinc-500">
          © {new Date().getFullYear()} Nookly. Built for Philippine drugstores &amp; pharmacies.
        </p>
      </div>
    </footer>
  );
}
