import Link from "next/link";
import {
  AlarmClock,
  BadgePercent,
  Boxes,
  ClipboardList,
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
  type DashboardScope,
} from "@/lib/dashboard-data";
import { CountUp, DailySalesBars, HourlySalesLine } from "./charts";
import { AlertRow, Card, DeltaChip, PaymentMix, RankBars, StatTile } from "./widgets";

const PH_OFFSET_MS = 8 * 60 * 60 * 1000;
const phHourNow = () => new Date(Date.now() + PH_OFFSET_MS).getUTCHours();
const timePH = (iso: string) => new Date(iso).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" });

export interface HeroInfo {
  firstName: string;
  roleLabel: string;
  branchName: string | null;
  trialDaysLeft: number | null;
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
                <Sparkles className="h-3 w-3" /> {info.trialDaysLeft} days left sa free trial
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

function HeroStat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-28 rounded-xl bg-white/10 px-3.5 py-2.5 ring-1 ring-white/15 backdrop-blur">
      <p className="text-[11px] text-emerald-50/80">{label}</p>
      <p className="mt-0.5 text-base font-semibold">{value}</p>
    </div>
  );
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
  const rows: React.ReactNode[] = [];
  if (queues.pendingOrders > 0)
    rows.push(<AlertRow key="po" title={`${queues.pendingOrders} order${queues.pendingOrders > 1 ? "s" : ""} waiting for a cashier`} status="warning" statusLabel="Waiting" />);
  if (queues.stockRequests > 0)
    rows.push(<AlertRow key="sr" title={`${queues.stockRequests} stock request${queues.stockRequests > 1 ? "s" : ""} to review`} detail="Inventory › All branches" status="warning" statusLabel="Review" />);
  if (queues.prescriptions > 0)
    rows.push(<AlertRow key="rx" title={`${queues.prescriptions} prescription${queues.prescriptions > 1 ? "s" : ""} pending`} status="info" statusLabel="Pending" />);
  for (const b of expiring?.items ?? [])
    rows.push(
      <AlertRow
        key={b.id}
        title={b.name}
        detail={`Batch ${b.batchNumber} · ${b.quantity} left`}
        status={b.daysLeft < 0 ? "critical" : "warning"}
        statusLabel={b.daysLeft < 0 ? "Expired" : `${b.daysLeft}d left`}
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
  const [today, trend, mtd, top, mix, low, expiring] = await Promise.all([
    getTodayVsYesterday(scope),
    getSalesTrend(scope, 7),
    getMonthToDate(scope),
    getTopProducts(scope, 7, 5),
    getPaymentMix(scope, 30),
    p.inventory ? getLowStock(scope, 0) : null,
    p.inventory ? getExpiring(scope, 60, 0) : null,
  ]);
  const week = trend.daily.reduce((s, d) => s + d.total, 0);

  return (
    <div className="space-y-6">
      <Hero
        info={info}
        eyebrow={scope.storeId ? "Today's sales · this branch" : "Today's sales"}
        aside={
          <>
            <HeroStat label="Transactions" value={<CountUp value={today.transactions} format="int" />} />
            <HeroStat label="Average sale" value={peso(today.average)} />
            <HeroStat label="Last 7 days" value={peso(week)} />
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
            href="/inventory"
            tone={expiring.expired ? "critical" : expiring.count ? "warning" : "default"}
          />
        )}
      </div>

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
  const [today, trend, shifts, leaders, low] = await Promise.all([
    getTodayVsYesterday(scope),
    getSalesTrend(scope, 7),
    getOpenShifts(scope),
    getStaffLeaderboard(scope, 5),
    p.inventory ? getLowStock(scope, 0) : null,
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
            <HeroStat label="On shift now" value={<CountUp value={shifts.length} format="int" />} />
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

      {low && low.count > 0 && (
        <p className="text-center text-xs text-zinc-400">
          {low.count} product{low.count > 1 ? "s are" : " is"} at or below minimum stock{p.inventory && " — see Inventory"}.
        </p>
      )}
    </div>
  );
}

// ─── Pharmacist & Pharmacy Tech: stock and prescriptions health ─────────────
export async function PharmacistDashboard({ scope, info }: { scope: DashboardScope; info: HeroInfo }) {
  const p = scope.permissions;
  const [expiring, low, queues] = await Promise.all([
    p.inventory ? getExpiring(scope, 60, 8) : null,
    p.inventory ? getLowStock(scope, 8) : null,
    getQueues(scope),
  ]);
  const attention = (expiring?.count ?? 0) + (low?.count ?? 0) + queues.prescriptions;
  return (
    <div className="space-y-6">
      <Hero
        info={info}
        eyebrow="Items needing attention"
        aside={
          <>
            <HeroStat label="Expired batches" value={<CountUp value={expiring?.expired ?? 0} format="int" />} />
            <HeroStat label="Expiring ≤ 60 days" value={<CountUp value={expiring?.count ?? 0} format="int" />} />
            <HeroStat label="Low on stock" value={<CountUp value={low?.count ?? 0} format="int" />} />
          </>
        }
      >
        <p className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">
          <CountUp value={attention} format="int" />
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {p.inventory && <QuickLink href="/inventory" icon={Boxes} label="Inventory" primary />}
          {p.prescriptions && <QuickLink href="/prescriptions" icon={ClipboardPlus} label="Prescriptions" />}
          {p.pos && <QuickLink href="/pos" icon={ShoppingCart} label="POS" />}
        </div>
      </Hero>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile icon={AlarmClock} label="Expired batches" value={expiring?.expired ?? 0} hint="Pull from shelves" tone={expiring?.expired ? "critical" : "default"} href={p.inventory ? "/inventory" : undefined} />
        <StatTile icon={AlarmClock} label="Expiring in 60 days" value={expiring?.count ?? 0} hint="Sell these first" tone={expiring?.count ? "warning" : "default"} href={p.inventory ? "/inventory" : undefined} />
        <StatTile icon={PackageX} label="Low on stock" value={low?.count ?? 0} hint={low?.outOfStock ? `${low.outOfStock} out of stock` : "At or below minimum"} tone={low?.outOfStock ? "critical" : low?.count ? "warning" : "default"} href={p.inventory ? "/inventory" : undefined} />
        <StatTile icon={ClipboardList} label="Pending prescriptions" value={queues.prescriptions} hint="Waiting to be filled" tone={queues.prescriptions ? "warning" : "default"} href={p.prescriptions ? "/prescriptions" : undefined} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Expiring soonest" subtitle="Batches with stock, next 60 days" action={p.inventory ? { href: "/inventory", label: "Batches" } : undefined}>
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
                />
              ))}
            </ul>
          )}
        </Card>
        <Card title="Running low" subtitle="Reorder before these run out" action={p.inventory ? { href: "/inventory", label: "Stock levels" } : undefined}>
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
                />
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

// ─── Cashier: my shift and my sales ─────────────────────────────────────────
export async function CashierDashboard({ scope, info }: { scope: DashboardScope; info: HeroInfo }) {
  const p = scope.permissions;
  const [me, queues] = await Promise.all([getMyCounter(scope.session), getQueues(scope)]);
  return (
    <div className="space-y-6">
      <Hero
        info={info}
        eyebrow={me.shift ? `Your shift · open since ${timePH(me.shift.openedAt)}` : "Your shift"}
        aside={
          me.shift ? (
            <>
              <HeroStat label="Sales this shift" value={<CountUp value={me.shift.count} format="int" />} />
              <HeroStat label="Cash sales" value={peso(me.shift.cashSales)} />
              <HeroStat label="Starting cash" value={peso(me.shift.startingCash)} />
            </>
          ) : undefined
        }
      >
        {me.shift ? (
          <p className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">
            <CountUp value={me.shift.total} />
          </p>
        ) : (
          <p className="mt-1 text-2xl font-semibold tracking-tight">No shift open yet</p>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {p.pos && <QuickLink href="/pos" icon={ShoppingCart} label={me.shift ? "Go to POS" : "Start shift in POS"} primary />}
          {p.sales && <QuickLink href="/sales" icon={Receipt} label="My sales" />}
        </div>
      </Hero>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile icon={Coins} label="My sales today" value={<CountUp value={me.todayTotal} />} tone="good" />
        <StatTile icon={Receipt} label="Transactions today" value={me.todayCount} hint={me.todayCount ? `Avg ${peso(me.todayTotal / me.todayCount)}` : undefined} />
        <StatTile
          icon={Users}
          label="Orders waiting"
          value={queues.pendingOrders}
          hint={queues.pendingOrders ? "Open Orders in the POS" : "None right now"}
          tone={queues.pendingOrders ? "warning" : "default"}
          href={p.pos ? "/pos" : undefined}
        />
      </div>

      <Card title="My recent sales" subtitle="Your last 5 transactions" action={p.sales ? { href: "/sales", label: "All my sales" } : undefined}>
        {me.recent.length === 0 ? (
          <p className="py-6 text-center text-sm text-zinc-400">No sales yet — your first one will show up here.</p>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {me.recent.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-zinc-800">{s.saleNumber}</p>
                  <p className="text-xs text-zinc-400">
                    {timePH(s.saleDate)} · {s.items} item{s.items === 1 ? "" : "s"} · {s.paymentMethod.replace("_", " ").toLowerCase()}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold tabular-nums text-zinc-900">{peso(s.total)}</p>
                  {s.status !== "COMPLETED" && <p className="text-[11px] font-semibold text-zinc-400">{s.status.toLowerCase()}</p>}
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
