import Link from "next/link";
import {
  AlarmClock,
  BadgePercent,
  Boxes,
  ClipboardPlus,
  Coins,
  PackageX,
  Receipt,
  ShoppingCart,
  Sparkles,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { peso, formatDate } from "@/lib/format";
import { startOfTodayPH } from "@/lib/timezone";
import { prisma } from "@/lib/prisma";
import {
  getExpiring,
  getInventoryValue,
  getLowStock,
  getMonthToDate,
  getMyCounter,
  getMyOrders,
  getOpenShifts,
  getPaymentMix,
  getQueues,
  getSalesTrend,
  getStaffLeaderboard,
  getTodayVsYesterday,
  getTopProducts,
  getPendingPrescriptions,
  getWaitingOrders,
  type DashboardScope,
} from "@/lib/dashboard-data";
import { CountUp, DailySalesBars, HourlySalesLine } from "./charts";
import { AlertRow, Card, DeltaChip, PaymentMix, RankBars, StatTile } from "./widgets";
import { LiveWaitingOrders, PriceCheck, ReprintButton } from "./cashier-tools";
import { branchHasOrderTakers } from "@/lib/branch-scope";

const PH_OFFSET_MS = 8 * 60 * 60 * 1000;
const phHourNow = () => new Date(Date.now() + PH_OFFSET_MS).getUTCHours();
const timePH = (iso: string) => new Date(iso).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" });

export interface HeroInfo {
  firstName: string;
  roleLabel: string;
  branchName: string | null;
  isMultiBranch: boolean;
  trialDaysLeft: number | null;
}

// Every role gets the lookup; with several branches it also shows where else
// an item is in stock, so nobody has to call around.
function PriceCheckCard({ info, className }: { info: HeroInfo; className?: string }) {
  return (
    <Card
      title="Price & stock check"
      subtitle={info.isMultiBranch ? "Price and stock here, plus which other branches have it" : "Look up a price or stock level without touching the cart"}
      className={className}
    >
      <PriceCheck showBranches={info.isMultiBranch} />
    </Card>
  );
}

function greeting() {
  const h = phHourNow();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

// The banner every dashboard opens with: who you are, where, and the one
// number that matters most for your role.
function Hero({ info, eyebrow, children, aside }: { info: HeroInfo; eyebrow: string; children: React.ReactNode; aside?: React.ReactNode }) {
  const today = new Date().toLocaleDateString("en-PH", { weekday: "long", month: "long", day: "numeric", timeZone: "Asia/Manila" });
  return (
    <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-700 via-emerald-600 to-teal-600 p-5 text-white shadow-md shadow-emerald-900/10 sm:p-6">
      <div className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full bg-white/10 blur-2xl" />
      <div className="pointer-events-none absolute -bottom-24 left-1/3 h-56 w-56 rounded-full bg-teal-300/20 blur-2xl" />
      <div className="relative flex flex-wrap items-start justify-between gap-6">
        <div className="min-w-0">
          <p className="text-sm text-emerald-50/90">
            {greeting()}, <span className="font-semibold text-white">{info.firstName}</span> · {today}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full bg-white/15 px-2.5 py-1 font-semibold">{info.roleLabel}</span>
            {info.branchName && <span className="rounded-full bg-white/15 px-2.5 py-1 font-semibold">{info.branchName}</span>}
            {info.trialDaysLeft !== null && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-300/90 px-2.5 py-1 font-semibold text-amber-950">
                <Sparkles className="h-3 w-3" /> {info.trialDaysLeft} {info.trialDaysLeft === 1 ? "day" : "days"} left in your free trial
              </span>
            )}
          </div>
          <p className="mt-4 text-[11px] font-semibold uppercase tracking-wider text-emerald-50/80">{eyebrow}</p>
          {children}
        </div>
        {aside && <div className="flex flex-wrap gap-3">{aside}</div>}
      </div>
    </section>
  );
}

function HeroStat({ label, value, href }: { label: string; value: React.ReactNode; href?: string }) {
  const body = (
    <div className={`min-w-28 rounded-xl bg-white/10 px-3.5 py-2.5 ring-1 ring-white/15 backdrop-blur ${href ? "transition hover:bg-white/20" : ""}`}>
      <p className="text-[11px] text-emerald-50/80">{label}</p>
      <p className="mt-0.5 text-base font-semibold">{value}</p>
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

function QuickLink({ href, icon: Icon, label, primary = false }: { href: string; icon: typeof ShoppingCart; label: string; primary?: boolean }) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
        primary ? "bg-white text-emerald-800 shadow hover:bg-emerald-50" : "bg-white/15 text-white ring-1 ring-white/25 hover:bg-white/25"
      }`}
    >
      <Icon className="h-3.5 w-3.5" /> {label}
    </Link>
  );
}

async function AttentionCard({ scope, show }: { scope: DashboardScope; show: { stock: boolean; expiry: boolean } }) {
  const [queues, low, expiring] = await Promise.all([
    getQueues(scope),
    show.stock ? getLowStock(scope, 4) : null,
    show.expiry ? getExpiring(scope, 30, 4) : null,
  ]);
  const p = scope.permissions;
  const rows: React.ReactNode[] = [];
  if (queues.pendingOrders > 0)
    rows.push(<AlertRow key="po" title={`${queues.pendingOrders} order${queues.pendingOrders > 1 ? "s" : ""} waiting for a cashier`} detail="POS › Orders" status="warning" statusLabel="Waiting" href={p.pos ? "/pos" : undefined} />);
  if (queues.stockRequests > 0)
    rows.push(<AlertRow key="sr" title={`${queues.stockRequests} stock request${queues.stockRequests > 1 ? "s" : ""} to review`} detail="Inventory › All branches" status="warning" statusLabel="Review" href="/inventory?tab=branches" />);
  if (queues.prescriptions > 0)
    rows.push(<AlertRow key="rx" title={`${queues.prescriptions} prescription${queues.prescriptions > 1 ? "s" : ""} pending`} status="info" statusLabel="Pending" href={p.prescriptions ? "/prescriptions" : undefined} />);
  for (const b of expiring?.items ?? [])
    rows.push(
      <AlertRow
        key={b.id}
        title={b.name}
        detail={`Batch ${b.batchNumber} · ${b.quantity} left`}
        status={b.daysLeft < 0 ? "critical" : "warning"}
        statusLabel={b.daysLeft < 0 ? "Expired" : `${b.daysLeft}d left`}
        href="/inventory?tab=batches"
      />
    );
  for (const s of low?.items ?? [])
    rows.push(
      <AlertRow
        key={`low-${s.id}-${s.branch}`}
        title={s.name}
        detail={scope.storeId ? `Minimum ${s.minimum}` : `${s.branch} · minimum ${s.minimum}`}
        status={s.stock <= 0 ? "critical" : "warning"}
        statusLabel={s.stock <= 0 ? "Out of stock" : `${s.stock} left`}
        href="/inventory"
      />
    );
  return (
    <Card title="Needs attention" subtitle="Things waiting on someone today">
      {rows.length === 0 ? (
        <div className="flex flex-col items-center py-6 text-center">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
            <Sparkles className="h-5 w-5" />
          </span>
          <p className="mt-2 text-sm font-medium text-zinc-800">All clear</p>
          <p className="text-xs text-zinc-400">Nothing needs your attention right now.</p>
        </div>
      ) : (
        <ul className="divide-y divide-zinc-100">{rows.slice(0, 8)}</ul>
      )}
    </Card>
  );
}

// ─── Owner & Admin: the whole business at a glance ──────────────────────────
// What the stock in the store is worth right now — the owner's capital on the shelves.
function StockOnHandCard({ value }: { value: Awaited<ReturnType<typeof getInventoryValue>> }) {
  const profit = value.retail - value.cost;
  const showBranches = value.branches.length > 1;
  return (
    <Card
      title="Stock on hand"
      subtitle={showBranches ? "What the stock in all your branches is worth right now" : "What the stock in your store is worth right now"}
      action={{ href: "/inventory", label: "Inventory" }}
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <p className="text-xs font-medium text-zinc-500">Cost of inventory</p>
          <p className="mt-0.5 text-2xl font-semibold tracking-tight text-zinc-900">
            <CountUp value={value.cost} />
          </p>
          <p className="mt-0.5 text-xs text-zinc-400">What you paid for it</p>
        </div>
        <div>
          <p className="text-xs font-medium text-zinc-500">At selling price</p>
          <p className="mt-0.5 text-2xl font-semibold tracking-tight text-zinc-900">
            <CountUp value={value.retail} />
          </p>
          <p className="mt-0.5 text-xs text-zinc-400">If all of it sells</p>
        </div>
        <div>
          <p className="text-xs font-medium text-zinc-500">Potential profit</p>
          <p className="mt-0.5 text-2xl font-semibold tracking-tight text-emerald-700">
            <CountUp value={profit} />
          </p>
          <p className="mt-0.5 text-xs text-zinc-400">
            {value.products.toLocaleString("en-PH")} products · {value.units.toLocaleString("en-PH")} units
          </p>
        </div>
      </div>

      {value.expiredCost > 0 && (
        <Link
          href="/inventory?tab=batches"
          className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-800 hover:bg-red-100"
        >
          <span>
            <span className="font-semibold">{peso(value.expiredCost)}</span>{" "}of it (at cost) is already expired and can&apos;t be sold
          </span>
          <span className="shrink-0 font-semibold">Review →</span>
        </Link>
      )}

      {showBranches && (
        <ul className="mt-5 divide-y divide-zinc-100 border-t border-zinc-100">
          {value.branches.map((b) => {
            const share = value.cost > 0 ? (b.cost / value.cost) * 100 : 0;
            return (
              <li key={b.id} className="flex items-center gap-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-zinc-800">{b.name}</p>
                  <span className="mt-1.5 flex items-center gap-2">
                    <span className="h-1.5 max-w-48 flex-1 overflow-hidden rounded-full bg-zinc-100">
                      <span className="block h-full rounded-full bg-emerald-500" style={{ width: `${share}%` }} />
                    </span>
                    <span className="text-[11px] tabular-nums text-zinc-400">{share.toFixed(0)}% of stock</span>
                  </span>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold tabular-nums text-zinc-900">{peso(b.cost)}</p>
                  <p className="text-[11px] tabular-nums text-zinc-400">
                    {b.units.toLocaleString("en-PH")} units · {peso(b.retail)} selling
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

export async function OwnerDashboard({
  scope,
  info,
  branchRows,
  plan,
}: {
  scope: DashboardScope;
  info: HeroInfo;
  branchRows: { id: string; name: string; isCurrent: boolean; sales: number; transactions: number; lowStock: number; staff: number }[] | null;
  plan: { name: string; detail: string | null } | null;
}) {
  const p = scope.permissions;
  const [today, trend, mtd, top, mix, low, expiring, stockValue] = await Promise.all([
    getTodayVsYesterday(scope),
    getSalesTrend(scope, 7),
    getMonthToDate(scope),
    getTopProducts(scope, 7, 5),
    getPaymentMix(scope, 30),
    p.inventory ? getLowStock(scope, 0) : null,
    p.inventory ? getExpiring(scope, 60, 0) : null,
    p.inventory ? getInventoryValue(scope) : null,
  ]);

  return (
    <div className="space-y-6">
      <Hero
        info={info}
        eyebrow={scope.storeId ? "Today's sales · this branch" : "Today's sales"}
        aside={
          <>
            <HeroStat label="Transactions" value={<CountUp value={today.transactions} format="int" />} />
            <HeroStat label="Average sale" value={peso(today.average)} />
          </>
        }
      >
        <p className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">
          <CountUp value={today.total} />
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <DeltaChip pct={today.changePct} versus="vs this time yesterday" tone="dark" />
          {p.pos && <QuickLink href="/pos" icon={ShoppingCart} label="Open POS" primary />}
          {p.reports && <QuickLink href="/reports" icon={TrendingUp} label="Reports" />}
        </div>
      </Hero>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile icon={Coins} label="Sales this month" value={<CountUp value={mtd.revenue} />} hint={`Since ${new Date(mtd.monthStart).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Manila" })}`} tone="good" />
        <StatTile
          icon={BadgePercent}
          label="Gross profit this month"
          value={<CountUp value={mtd.profit} />}
          hint={mtd.margin === null ? "No sales yet" : `${mtd.margin.toFixed(1)}% margin`}
          tone="good"
        />
        {low && (
          <StatTile
            icon={PackageX}
            label="Low on stock"
            value={<CountUp value={low.count} format="int" />}
            hint={low.outOfStock ? `${low.outOfStock} out of stock` : "At or below minimum"}
            href="/inventory"
            tone={low.outOfStock ? "critical" : low.count ? "warning" : "default"}
          />
        )}
        {expiring && (
          <StatTile
            icon={AlarmClock}
            label="Expiring in 60 days"
            value={<CountUp value={expiring.count} format="int" />}
            hint={expiring.expired ? `${expiring.expired} already expired` : "Batches with stock"}
            href="/inventory?tab=batches"
            tone={expiring.expired ? "critical" : expiring.count ? "warning" : "default"}
          />
        )}
      </div>

      {stockValue && <StockOnHandCard value={stockValue} />}

      <div className="grid gap-6 xl:grid-cols-5">
        <Card title="Last 7 days" subtitle="Completed sales per day" className="xl:col-span-3" action={p.sales ? { href: "/sales", label: "Sales" } : undefined}>
          <DailySalesBars days={trend.daily} />
        </Card>
        <Card title="Today by hour" subtitle="When customers are buying" className="xl:col-span-2">
          <HourlySalesLine hours={trend.hourly} currentHour={phHourNow()} />
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Best sellers" subtitle="Last 7 days, by sales">
          <RankBars rows={top.map((t) => ({ id: t.id, name: t.name, value: t.revenue, detail: `${t.units} sold` }))} empty="No sales in the last 7 days." />
        </Card>
        <Card title="How customers pay" subtitle="Last 30 days">
          <PaymentMix rows={mix} />
        </Card>
        <AttentionCard scope={scope} show={{ stock: p.inventory, expiry: p.inventory }} />
      </div>

      <PriceCheckCard info={info} />

      {branchRows && (
        <Card title="By branch · today" subtitle="Every branch side by side">
          <div className="-mx-2 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-100 text-left text-xs font-medium uppercase text-zinc-400">
                  <th className="px-2 py-2.5">Branch</th>
                  <th className="px-2 py-2.5 text-right">Sales</th>
                  <th className="px-2 py-2.5 text-right">Transactions</th>
                  <th className="px-2 py-2.5 text-right">Low stock</th>
                  <th className="px-2 py-2.5 text-right">Staff</th>
                </tr>
              </thead>
              <tbody>
                {branchRows.map((b) => (
                  <tr key={b.id} className="border-b border-zinc-50 last:border-0">
                    <td className="px-2 py-2.5 font-medium text-zinc-900">
                      {b.name}
                      {b.isCurrent && <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">You&apos;re here</span>}
                    </td>
                    <td className="px-2 py-2.5 text-right tabular-nums text-zinc-900">{peso(b.sales)}</td>
                    <td className="px-2 py-2.5 text-right tabular-nums text-zinc-600">{b.transactions}</td>
                    <td className="px-2 py-2.5 text-right tabular-nums text-zinc-600">{b.lowStock}</td>
                    <td className="px-2 py-2.5 text-right tabular-nums text-zinc-600">{b.staff}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {plan && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-white px-5 py-4 text-sm">
          <p className="text-zinc-600">
            <span className="font-semibold text-zinc-900">{plan.name} plan</span>
            {plan.detail && <span className="text-zinc-400"> · {plan.detail}</span>}
          </p>
          {p.settings && (
            <Link href="/settings" className="font-semibold text-emerald-700 hover:text-emerald-900">
              Manage plan →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Manager: running the branch today ──────────────────────────────────────
export async function ManagerDashboard({ scope, info }: { scope: DashboardScope; info: HeroInfo }) {
  const p = scope.permissions;
  const [today, trend, shifts, leaders] = await Promise.all([
    getTodayVsYesterday(scope),
    getSalesTrend(scope, 7),
    getOpenShifts(scope),
    getStaffLeaderboard(scope, 5),
  ]);
  return (
    <div className="space-y-6">
      <Hero
        info={info}
        eyebrow={scope.storeId ? "Branch sales today" : "Sales today"}
        aside={
          <>
            <HeroStat label="Transactions" value={<CountUp value={today.transactions} format="int" />} />
            <HeroStat label="Average sale" value={peso(today.average)} />
          </>
        }
      >
        <p className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">
          <CountUp value={today.total} />
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <DeltaChip pct={today.changePct} versus="vs this time yesterday" tone="dark" />
          {p.pos && <QuickLink href="/pos" icon={ShoppingCart} label="Open POS" primary />}
          {p.shifts && <QuickLink href="/shifts" icon={Wallet} label="Shifts" />}
        </div>
      </Hero>

      <div className="grid gap-6 xl:grid-cols-5">
        <Card title="Today by hour" subtitle="Plan staffing around the rush" className="xl:col-span-3">
          <HourlySalesLine hours={trend.hourly} currentHour={phHourNow()} />
        </Card>
        <Card title="On shift now" subtitle="Open shifts and what each has rung up" className="xl:col-span-2" action={p.shifts ? { href: "/shifts", label: "All shifts" } : undefined}>
          {shifts.length === 0 ? (
            <p className="py-6 text-center text-sm text-zinc-400">No one has an open shift.</p>
          ) : (
            <ul className="divide-y divide-zinc-100">
              {shifts.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-xs font-bold text-emerald-700">
                      {s.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-zinc-800">{s.name}</p>
                      <p className="text-xs text-zinc-400">
                        Since {timePH(s.openedAt)}
                        {!scope.storeId && ` · ${s.branch}`}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold tabular-nums text-zinc-900">{peso(s.total)}</p>
                    <p className="text-xs text-zinc-400">{s.count} sales</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Top sellers today" subtitle="Staff ranked by sales">
          <RankBars rows={leaders.map((l) => ({ id: l.id, name: l.name, value: l.total, detail: `${l.count} sales` }))} empty="No sales yet today." />
        </Card>
        <Card title="Last 7 days" subtitle="Completed sales per day">
          <DailySalesBars days={trend.daily} />
        </Card>
        <AttentionCard scope={scope} show={{ stock: p.inventory, expiry: p.inventory }} />
      </div>

      <PriceCheckCard info={info} />
    </div>
  );
}

// ─── Pharmacist & Pharmacy Tech: stock and prescriptions health ─────────────
export async function PharmacistDashboard({ scope, info }: { scope: DashboardScope; info: HeroInfo }) {
  const p = scope.permissions;
  const [expiring, low, rx, queues] = await Promise.all([
    p.inventory ? getExpiring(scope, 60, 8) : null,
    p.inventory ? getLowStock(scope, 8) : null,
    getPendingPrescriptions(scope, 8),
    getQueues(scope),
  ]);
  const rxCount = p.prescriptions ? queues.prescriptions : 0;
  const attention = (expiring?.count ?? 0) + (low?.count ?? 0) + rxCount;
  const batches = p.inventory ? "/inventory?tab=batches" : undefined;
  const stock = p.inventory ? "/inventory" : undefined;
  const rxHref = p.prescriptions ? "/prescriptions" : undefined;
  return (
    <div className="space-y-6">
      <Hero
        info={info}
        eyebrow="Items needing attention"
        aside={
          <>
            {p.inventory && <HeroStat label="Expired batches" value={expiring?.expired ?? 0} href={batches} />}
            {p.inventory && <HeroStat label="Expiring ≤ 60 days" value={expiring?.count ?? 0} href={batches} />}
            {p.inventory && <HeroStat label="Low on stock" value={low?.count ?? 0} href={stock} />}
            {p.prescriptions && <HeroStat label="Prescriptions pending" value={rxCount} href={rxHref} />}
          </>
        }
      >
        <p className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">
          <CountUp value={attention} format="int" />
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {p.inventory && <QuickLink href="/inventory?tab=batches" icon={Boxes} label="Receive or discard batches" primary />}
          {p.prescriptions && <QuickLink href="/prescriptions" icon={ClipboardPlus} label="Prescriptions" />}
          {p.pos && <QuickLink href="/pos" icon={ShoppingCart} label="POS" />}
        </div>
      </Hero>

      <div className={`grid gap-6 ${p.prescriptions && p.inventory ? "xl:grid-cols-3" : "lg:grid-cols-2"}`}>
        {p.inventory && (
          <Card title="Expiring soonest" subtitle="Pull expired lots, sell the next ones first" action={{ href: "/inventory?tab=batches", label: "Batches" }}>
            {!expiring || expiring.items.length === 0 ? (
              <p className="py-6 text-center text-sm text-zinc-400">Nothing expiring in the next 60 days.</p>
            ) : (
              <ul className="divide-y divide-zinc-100">
                {expiring.items.map((b) => (
                  <AlertRow
                    key={b.id}
                    title={b.name}
                    detail={`Batch ${b.batchNumber} · ${b.quantity} left · ${formatDate(b.expirationDate)}`}
                    status={b.daysLeft < 0 ? "critical" : b.daysLeft <= 30 ? "warning" : "info"}
                    statusLabel={b.daysLeft < 0 ? "Expired" : `${b.daysLeft}d left`}
                    href={batches}
                  />
                ))}
              </ul>
            )}
          </Card>
        )}
        {p.inventory && (
          <Card title="Running low" subtitle="Reorder before these run out" action={{ href: "/inventory", label: "Stock levels" }}>
            {!low || low.items.length === 0 ? (
              <p className="py-6 text-center text-sm text-zinc-400">Every product is above its minimum.</p>
            ) : (
              <ul className="divide-y divide-zinc-100">
                {low.items.map((s) => (
                  <AlertRow
                    key={`${s.id}-${s.branch}`}
                    title={s.name}
                    detail={`Minimum ${s.minimum}${scope.storeId ? "" : ` · ${s.branch}`}`}
                    status={s.stock <= 0 ? "critical" : "warning"}
                    statusLabel={s.stock <= 0 ? "Out of stock" : `${s.stock} left`}
                    href={stock}
                  />
                ))}
              </ul>
            )}
          </Card>
        )}
        {p.prescriptions && (
          <Card title="Prescriptions to fill" subtitle="Oldest first" action={{ href: "/prescriptions", label: "All prescriptions" }}>
            {rx.length === 0 ? (
              <p className="py-6 text-center text-sm text-zinc-400">No prescriptions waiting.</p>
            ) : (
              <ul className="divide-y divide-zinc-100">
                {rx.map((r) => (
                  <AlertRow
                    key={r.id}
                    title={`${r.number} · ${r.patient}`}
                    detail={`${r.items} item${r.items === 1 ? "" : "s"} · received ${formatDate(r.createdAt)}`}
                    status={r.status === "PARTIAL" ? "warning" : "info"}
                    statusLabel={r.status === "PARTIAL" ? "Partly filled" : "Pending"}
                    href={rxHref}
                  />
                ))}
              </ul>
            )}
          </Card>
        )}
      </div>

      <PriceCheckCard info={info} />
    </div>
  );
}

// ─── Cashier: my shift, my drawer, my counter tools ─────────────────────────
const methodLabel = (m: string) =>
  ({ CASH: "Cash", E_WALLET: "E-wallet", CREDIT_CARD: "Credit card", DEBIT_CARD: "Debit card", INSURANCE: "Insurance", CHECK: "Check", SPLIT: "Split" })[m] ?? m;

export async function CashierDashboard({ scope, info }: { scope: DashboardScope; info: HeroInfo }) {
  const p = scope.permissions;
  const [me, orders, hasOrderTakers] = await Promise.all([
    getMyCounter(scope.session),
    getWaitingOrders(scope.session),
    branchHasOrderTakers(scope.session.tenantId, scope.session.storeId),
  ]);
  const shift = me.shift;
  // Same parts the shift close adds up, so the total matches end-of-shift.
  const drawerRows = shift
    ? [
        { label: "Starting cash", value: shift.startingCash },
        { label: "Cash sales", value: shift.cashSales },
        ...(shift.eWallet.cashInCount ? [{ label: `E-wallet cash in (${shift.eWallet.cashInCount})`, value: shift.eWallet.cashInTotal }] : []),
        ...(shift.eWallet.cashOutCount ? [{ label: `E-wallet cash out (${shift.eWallet.cashOutCount})`, value: -shift.eWallet.cashOutTotal }] : []),
        ...(shift.load.count ? [{ label: `Load sold (${shift.load.count})`, value: shift.load.total }] : []),
        ...(shift.eWallet.feesEarned + shift.load.feesEarned
          ? [{ label: "Service fees earned", value: shift.eWallet.feesEarned + shift.load.feesEarned }]
          : []),
        ...(shift.expenses ? [{ label: "Expenses paid out", value: -shift.expenses }] : []),
      ]
    : [];

  return (
    <div className="space-y-6">
      <Hero
        info={info}
        eyebrow={shift ? `Your shift · open since ${timePH(shift.openedAt)}` : "Your shift"}
        aside={
          shift ? (
            <>
              <HeroStat label="Transactions" value={shift.salesCount} />
              <HeroStat label="Average sale" value={peso(shift.salesCount ? shift.netSales / shift.salesCount : 0)} />
            </>
          ) : undefined
        }
      >
        {shift ? (
          <p className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">
            <CountUp value={shift.netSales} />
          </p>
        ) : (
          <p className="mt-1 text-2xl font-semibold tracking-tight">No shift open yet</p>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {p.pos && <QuickLink href="/pos" icon={ShoppingCart} label={shift ? "Go to POS" : "Start shift in POS"} primary />}
          {p.sales && <QuickLink href="/sales" icon={Receipt} label="My sales" />}
        </div>
      </Hero>

      {/* Live list where order takers work; elsewhere there are never orders to show. */}
      {hasOrderTakers && <LiveWaitingOrders initial={orders} canOpenPos={p.pos} />}

      <div className={`grid gap-6 ${shift ? "lg:grid-cols-3" : "lg:grid-cols-2"}`}>
        {shift && (
          <Card title="Cash drawer" subtitle="What should be in your drawer now">
            <p className="text-2xl font-semibold tracking-tight text-zinc-900">{peso(shift.expectedCash)}</p>
            <ul className="mt-3 space-y-1.5 border-t border-zinc-100 pt-3 text-sm">
              {drawerRows.map((r) => (
                <li key={r.label} className="flex justify-between gap-3">
                  <span className="text-zinc-500">{r.label}</span>
                  <span className={`tabular-nums ${r.value < 0 ? "text-red-600" : "text-zinc-800"}`}>
                    {r.value < 0 ? "−" : ""}
                    {peso(Math.abs(r.value))}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-zinc-400">Count your drawer against this when you end your shift.</p>
          </Card>
        )}
        {shift && (
          <Card title="Payments this shift" subtitle="Match e-wallet totals with the store's wallet">
            {shift.paymentMethods.length === 0 ? (
              <p className="py-6 text-center text-sm text-zinc-400">No sales yet this shift.</p>
            ) : (
              <ul className="space-y-2.5 text-sm">
                {shift.paymentMethods.map((m) => (
                  <li key={m.method} className="flex items-center justify-between gap-3">
                    <span className="text-zinc-700">
                      {methodLabel(m.method)} <span className="text-xs text-zinc-400">· {m.salesCount}</span>
                    </span>
                    <span className="font-semibold tabular-nums text-zinc-900">{peso(m.totalAmount)}</span>
                  </li>
                ))}
                {shift.returnsAmount !== 0 && (
                  <li className="flex items-center justify-between gap-3 border-t border-zinc-100 pt-2.5">
                    <span className="text-zinc-500">Returns / refunds</span>
                    <span className="tabular-nums text-red-600">−{peso(Math.abs(shift.returnsAmount))}</span>
                  </li>
                )}
              </ul>
            )}
          </Card>
        )}
        <PriceCheckCard info={info} />
        {!shift && (
          <Card title="Before you start" subtitle="Your first steps for the day">
            <ol className="space-y-2.5 text-sm text-zinc-700">
              <li>
                1. Open the POS and tap <span className="font-semibold">Start shift</span>.
              </li>
              <li>2. Count your starting cash and enter it.</li>
              <li>3. Ring up sales — your drawer total appears here as you go.</li>
            </ol>
          </Card>
        )}
      </div>

      <Card title="My recent sales" subtitle="Reprint a receipt when a customer asks" action={p.sales ? { href: "/sales", label: "All my sales" } : undefined}>
        {me.recent.length === 0 ? (
          <p className="py-6 text-center text-sm text-zinc-400">No sales yet — your first one will show up here.</p>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {me.recent.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-zinc-800">{s.saleNumber}</p>
                  <p className="text-xs text-zinc-400">
                    {timePH(s.saleDate)} · {s.items} item{s.items === 1 ? "" : "s"} · {methodLabel(s.paymentMethod).toLowerCase()}
                    {s.status !== "COMPLETED" && ` · ${s.status.toLowerCase()}`}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <p className="text-sm font-semibold tabular-nums text-zinc-900">{peso(s.total)}</p>
                  <ReprintButton saleId={s.id} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

// ─── Order taker: my orders today ───────────────────────────────────────────
export async function OrderTakerDashboard({ scope, info }: { scope: DashboardScope; info: HeroInfo }) {
  const mine = await getMyOrders(scope.session);
  return (
    <div className="space-y-6">
      <Hero info={info} eyebrow="Orders you sent today">
        <p className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">
          <CountUp value={mine.sent} format="int" />
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {scope.permissions.pos && <QuickLink href="/pos" icon={ShoppingCart} label="Take an order" primary />}
        </div>
      </Hero>
      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile icon={Users} label="Waiting for a cashier" value={mine.waiting} tone={mine.waiting ? "warning" : "default"} />
        <StatTile icon={Receipt} label="Paid" value={mine.completed} tone="good" />
        <StatTile icon={PackageX} label="Cancelled" value={mine.cancelled} />
      </div>
      <PriceCheckCard info={info} />
    </div>
  );
}

export async function branchRowsFor(tenantId: string, stores: { id: string; name: string }[], currentStoreId: string | null) {
  const todayStart = startOfTodayPH();
  const [salesByStore, staffByStore, lowStocks] = await Promise.all([
    prisma.sale.groupBy({ by: ["storeId"], where: { tenantId, status: "COMPLETED", saleDate: { gte: todayStart } }, _sum: { totalAmount: true }, _count: true }),
    prisma.user.groupBy({ by: ["storeId"], where: { tenantId, isActive: true }, _count: true }),
    prisma.productStock.findMany({
      where: { store: { tenantId }, isHidden: false, product: { isActive: true }, currentStock: { lte: 50 } },
      select: { storeId: true, currentStock: true, product: { select: { minimumStock: true } } },
    }),
  ]);
  return stores.map((store) => {
    const sales = salesByStore.find((r) => r.storeId === store.id);
    return {
      id: store.id,
      name: store.name,
      isCurrent: store.id === currentStoreId,
      sales: Number(sales?._sum.totalAmount ?? 0),
      transactions: sales?._count ?? 0,
      lowStock: lowStocks.filter((s) => s.storeId === store.id && s.currentStock <= s.product.minimumStock).length,
      staff: staffByStore.find((r) => r.storeId === store.id)?._count ?? 0,
    };
  });
}
