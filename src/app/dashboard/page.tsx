import Link from "next/link";
import { requireActiveSession } from "@/lib/require-session";
import { prisma } from "@/lib/prisma";
import { daysUntil } from "@/lib/plans";
import { startOfTodayPH } from "@/lib/timezone";
import { formatDate } from "@/lib/format";
import { getBranchContext } from "@/lib/branch-scope";
import { peso } from "@/lib/format";
import AppShell from "@/components/app/AppShell";

export default async function DashboardPage() {
  const session = await requireActiveSession();

  const tenant = await prisma.tenant.findUnique({
    where: { id: session.tenantId },
    include: {
      subscription: { include: { plan: true } },
      _count: {
        select: {
          products: { where: { isActive: true } },
          users: { where: { isActive: true } },
          stores: { where: { isActive: true } },
        },
      },
    },
  });

  if (!tenant) {
    return null;
  }

  const [todaySalesAgg, lowStockCount] = await Promise.all([
    prisma.sale.aggregate({
      where: {
        tenantId: tenant.id,
        status: "COMPLETED",
        saleDate: { gte: startOfTodayPH() },
      },
      _sum: { totalAmount: true },
      _count: true,
    }),
    prisma.productStock.count({
      where: {
        store: { tenantId: tenant.id },
        product: { isActive: true },
        currentStock: { lte: 10 },
      },
    }),
  ]);

  // Per-branch breakdown of the same numbers above — only for workspaces with
  // more than one branch, so single-branch dashboards are unchanged.
  const branchContext = await getBranchContext(session);
  const branchRows = branchContext.isMultiBranch
    ? await (async () => {
        const [salesByStore, lowByStore, staffByStore] = await Promise.all([
          prisma.sale.groupBy({
            by: ["storeId"],
            where: { tenantId: tenant.id, status: "COMPLETED", saleDate: { gte: startOfTodayPH() } },
            _sum: { totalAmount: true },
            _count: true,
          }),
          prisma.productStock.groupBy({
            by: ["storeId"],
            where: { store: { tenantId: tenant.id }, product: { isActive: true }, currentStock: { lte: 10 } },
            _count: true,
          }),
          prisma.user.groupBy({ by: ["storeId"], where: { tenantId: tenant.id, isActive: true }, _count: true }),
        ]);
        return branchContext.stores.map((store) => {
          const sales = salesByStore.find((r) => r.storeId === store.id);
          return {
            id: store.id,
            name: store.name,
            isCurrent: store.id === session.storeId,
            sales: Number(sales?._sum.totalAmount ?? 0),
            transactions: sales?._count ?? 0,
            lowStock: lowByStore.find((r) => r.storeId === store.id)?._count ?? 0,
            staff: staffByStore.find((r) => r.storeId === store.id)?._count ?? 0,
          };
        });
      })()
    : null;

  const subscription = tenant.subscription;
  const trialEndsAt = subscription?.trialEndsAt;
  const daysLeft = trialEndsAt ? daysUntil(trialEndsAt) : null;

  // Same "what does this status actually mean" derivation used on the
  // tenant's own Plan settings page, so the two never disagree.
  const expiryLabel =
    subscription?.status === "TRIALING" && trialEndsAt
      ? `Trial ends ${formatDate(trialEndsAt)}`
      : subscription?.status === "EXPIRED" || subscription?.status === "PAST_DUE"
      ? "Access paused — pick a plan to reactivate"
      : subscription?.currentPeriodEnd
      ? `${subscription.status === "CANCELED" ? "Ends" : "Renews"} ${formatDate(subscription.currentPeriodEnd)}`
      : null;

  return (
    <AppShell tenantName={tenant.name} tenantId={tenant.id} planName={subscription?.plan.name} role={session.role}>
      <div>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900">Welcome, {tenant.name}</h1>
            <p className="mt-1 text-sm text-zinc-500">workspace: {tenant.slug}</p>
          </div>
          {subscription?.status === "TRIALING" && daysLeft !== null && (
            <span className="rounded-full bg-emerald-100 px-4 py-2 text-sm font-semibold text-emerald-700">
              {daysLeft} days left sa free trial
            </span>
          )}
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-white p-6">
          <div>
            <p className="text-xs font-medium text-zinc-500">Current plan</p>
            <p className="mt-1 text-xl font-bold text-zinc-900">
              {subscription?.plan.name ?? "-"}
              {subscription && subscription.status !== "TRIALING" && (
                <span className="ml-1.5 text-sm font-medium text-zinc-400">
                  ({subscription.billingCycle === "YEARLY" ? "Yearly" : "Monthly"})
                </span>
              )}
            </p>
            {expiryLabel && <p className="mt-1 text-xs text-zinc-500">{expiryLabel}</p>}
          </div>
          <Link
            href="/settings"
            className="rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:border-zinc-300"
          >
            Manage plan
          </Link>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <div className="rounded-2xl border border-zinc-200 bg-white p-6">
            <p className="text-xs font-medium text-zinc-500">Today&apos;s sales</p>
            <p className="mt-1 text-xl font-bold text-zinc-900">
              ₱{Number(todaySalesAgg._sum.totalAmount ?? 0).toLocaleString("en-PH", { minimumFractionDigits: 2 })}
            </p>
            <p className="text-xs text-zinc-400">{todaySalesAgg._count} transaction(s)</p>
          </div>
          <div className="rounded-2xl border border-zinc-200 bg-white p-6">
            <p className="text-xs font-medium text-zinc-500">Products</p>
            <p className="mt-1 text-xl font-bold text-zinc-900">{tenant._count.products}</p>
          </div>
          <div className="rounded-2xl border border-zinc-200 bg-white p-6">
            <p className="text-xs font-medium text-zinc-500">Low stock</p>
            <p className="mt-1 text-xl font-bold text-amber-600">{lowStockCount}</p>
          </div>
          <div className="rounded-2xl border border-zinc-200 bg-white p-6">
            <p className="text-xs font-medium text-zinc-500">Branches</p>
            <p className="mt-1 text-xl font-bold text-zinc-900">{tenant._count.stores}</p>
          </div>
          <div className="rounded-2xl border border-zinc-200 bg-white p-6">
            <p className="text-xs font-medium text-zinc-500">Staff</p>
            <p className="mt-1 text-xl font-bold text-zinc-900">{tenant._count.users}</p>
          </div>
        </div>

        {branchRows && (
          <div className="mt-6 overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
            <p className="border-b border-zinc-100 px-4 py-3 text-sm font-semibold text-zinc-900">By branch · today</p>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-100 text-left text-xs font-medium uppercase text-zinc-400">
                  <th className="px-4 py-2.5">Branch</th>
                  <th className="px-4 py-2.5 text-right">Sales</th>
                  <th className="px-4 py-2.5 text-right">Transactions</th>
                  <th className="px-4 py-2.5 text-right">Low stock</th>
                  <th className="px-4 py-2.5 text-right">Staff</th>
                </tr>
              </thead>
              <tbody>
                {branchRows.map((b) => (
                  <tr key={b.id} className="border-b border-zinc-50 last:border-0">
                    <td className="px-4 py-2.5 font-medium text-zinc-900">
                      {b.name}
                      {b.isCurrent && <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">You&apos;re here</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-zinc-900">{peso(b.sales)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-zinc-600">{b.transactions}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-amber-600">{b.lowStock}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-zinc-600">{b.staff}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-8 flex gap-3">
          <Link
            href="/pos"
            className="rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500"
          >
            Open POS
          </Link>
          <Link
            href="/products"
            className="rounded-full border border-zinc-200 bg-white px-5 py-2.5 text-sm font-semibold text-zinc-700 hover:border-zinc-300"
          >
            Manage products
          </Link>
        </div>
      </div>
    </AppShell>
  );
}
