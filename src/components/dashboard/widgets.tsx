import Link from "next/link";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, CircleAlert, Clock3, type LucideIcon } from "lucide-react";
import { peso } from "@/lib/format";

export function Card({
  title,
  subtitle,
  action,
  children,
  className = "",
}: {
  title?: string;
  subtitle?: string;
  action?: { href: string; label: string };
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`min-w-0 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6 ${className}`}>
      {(title || action) && (
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            {title && <h2 className="text-sm font-semibold text-zinc-900">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-zinc-500">{subtitle}</p>}
          </div>
          {action && (
            <Link href={action.href} className="shrink-0 text-xs font-semibold text-emerald-700 hover:text-emerald-900">
              {action.label} →
            </Link>
          )}
        </div>
      )}
      {children}
    </section>
  );
}

// Signed change vs a named period. Up is good for sales, so up = green.
export function DeltaChip({ pct, versus, tone = "light" }: { pct: number | null; versus: string; tone?: "light" | "dark" }) {
  if (pct === null) {
    return <span className={`text-xs ${tone === "dark" ? "text-emerald-100/80" : "text-zinc-400"}`}>No sales yet {versus} to compare</span>;
  }
  const up = pct >= 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  const color =
    tone === "dark"
      ? up
        ? "bg-white/15 text-white"
        : "bg-red-500/25 text-red-50"
      : up
      ? "bg-emerald-50 text-emerald-700"
      : "bg-red-50 text-red-700";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${color}`}>
      <Icon className="h-3.5 w-3.5" />
      {up ? "+" : ""}
      {pct.toFixed(1)}% <span className="font-normal opacity-80">{versus}</span>
    </span>
  );
}

export function StatTile({
  icon: Icon,
  label,
  value,
  hint,
  href,
  tone = "default",
}: {
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  href?: string;
  tone?: "default" | "warning" | "critical" | "good";
}) {
  const iconTone = {
    default: "bg-zinc-100 text-zinc-600",
    good: "bg-emerald-50 text-emerald-700",
    warning: "bg-amber-50 text-amber-700",
    critical: "bg-red-50 text-red-700",
  }[tone];
  const body = (
    <div className="flex h-full items-start gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm transition hover:border-zinc-300 hover:shadow">
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${iconTone}`}>
        <Icon className="h-4.5 w-4.5" />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-medium text-zinc-500">{label}</p>
        <p className="mt-0.5 text-lg font-semibold text-zinc-900">{value}</p>
        {hint && <p className="mt-0.5 text-xs text-zinc-400">{hint}</p>}
      </div>
    </div>
  );
  return href ? (
    <Link href={href} className="block h-full">
      {body}
    </Link>
  ) : (
    body
  );
}

// Ranked list with an inline bar — one hue, longest bar = the leader.
export function RankBars({ rows, empty }: { rows: { id: string; name: string; value: number; detail?: string }[]; empty: string }) {
  if (rows.length === 0) return <p className="py-6 text-center text-sm text-zinc-400">{empty}</p>;
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <ol className="space-y-3">
      {rows.map((r, i) => (
        <li key={r.id}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="flex min-w-0 items-baseline gap-2">
              <span className="w-4 shrink-0 text-xs font-semibold text-zinc-400 tabular-nums">{i + 1}</span>
              <span className="truncate text-zinc-800">{r.name}</span>
            </span>
            <span className="shrink-0 font-semibold text-zinc-900 tabular-nums">{peso(r.value)}</span>
          </div>
          <div className="ml-6 mt-1.5 flex items-center gap-2">
            <div className="h-1.5 flex-1 rounded-full bg-emerald-50">
              <div className="h-1.5 rounded-full bg-emerald-500" style={{ width: `${Math.max(3, (r.value / max) * 100)}%` }} />
            </div>
            {r.detail && <span className="shrink-0 text-[11px] text-zinc-400">{r.detail}</span>}
          </div>
        </li>
      ))}
    </ol>
  );
}

// One row of a "needs attention" list. Status always carries an icon + label,
// never color alone.
export function AlertRow({
  title,
  detail,
  status,
  statusLabel,
}: {
  title: string;
  detail?: string;
  status: "critical" | "warning" | "info";
  statusLabel: string;
}) {
  const style = {
    critical: { cls: "bg-red-50 text-red-700", Icon: CircleAlert },
    warning: { cls: "bg-amber-50 text-amber-800", Icon: AlertTriangle },
    info: { cls: "bg-zinc-100 text-zinc-600", Icon: Clock3 },
  }[status];
  return (
    <li className="flex items-center justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <p className="truncate text-sm text-zinc-800">{title}</p>
        {detail && <p className="truncate text-xs text-zinc-400">{detail}</p>}
      </div>
      <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${style.cls}`}>
        <style.Icon className="h-3 w-3" />
        {statusLabel}
      </span>
    </li>
  );
}

// Payment mix as one thin segmented bar plus a legend with each share.
export function PaymentMix({ rows }: { rows: { method: string; total: number }[] }) {
  if (rows.length === 0) return <p className="py-6 text-center text-sm text-zinc-400">No sales in the last 30 days.</p>;
  const total = rows.reduce((s, r) => s + r.total, 0);
  // Sequential greens by share — a single "how much" scale, not categories of meaning.
  const shades = ["#047857", "#10b981", "#6ee7b7", "#a7f3d0", "#d1fae5", "#ecfdf5"];
  const label = (m: string) => ({ CASH: "Cash", CREDIT_CARD: "Credit card", DEBIT_CARD: "Debit card", INSURANCE: "Insurance", CHECK: "Check", SPLIT: "Split" })[m] ?? m;
  return (
    <div>
      <div className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full" role="img" aria-label="Payment methods share">
        {rows.map((r, i) => (
          <div key={r.method} style={{ width: `${(r.total / total) * 100}%`, background: shades[i] ?? shades[shades.length - 1] }} title={`${label(r.method)}: ${peso(r.total)}`} />
        ))}
      </div>
      <ul className="mt-4 space-y-2 text-sm">
        {rows.map((r, i) => (
          <li key={r.method} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-zinc-700">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: shades[i] ?? shades[shades.length - 1] }} />
              {label(r.method)}
            </span>
            <span className="tabular-nums text-zinc-500">
              {peso(r.total)} <span className="ml-1 font-semibold text-zinc-900">{Math.round((r.total / total) * 100)}%</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
