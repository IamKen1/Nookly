import Link from "next/link";
import { requireActiveSession } from "@/lib/require-session";
import { prisma } from "@/lib/prisma";
import { daysUntil } from "@/lib/plans";
import { startOfTodayPH } from "@/lib/timezone";
import { formatDate } from "@/lib/format";
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
