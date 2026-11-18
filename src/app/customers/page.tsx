import type { Prisma } from "@prisma/client";
import { requirePagePermission } from "@/lib/require-session";
import { prisma } from "@/lib/prisma";
import { getTenantWithPlan } from "@/lib/request-cache";
import { getLoyaltyConfig } from "@/lib/loyalty";
import { upgradeMessage } from "@/lib/plan-gating";
import AppShell from "@/components/app/AppShell";
import CustomersList from "@/components/customers/CustomersList";

const PAGE_SIZE = 50;

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await requirePagePermission("customers");
  const params = await searchParams;
  const asString = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || "";
  const search = asString(params.search).trim();
  const showInactive = asString(params.inactive) === "1";
  const page = Math.max(1, parseInt(asString(params.page), 10) || 1);

  const [tenant, loyalty] = await Promise.all([getTenantWithPlan(session.tenantId), getLoyaltyConfig(session.tenantId)]);
  if (!tenant) return null;

  const shell = (children: React.ReactNode) => (
    <AppShell tenantName={tenant.name} tenantId={tenant.id} planName={tenant.subscription?.plan.name} role={session.role}>
      {children}
    </AppShell>
  );

  if (!loyalty.planHasIt) {
    return shell(
      <div className="mx-auto max-w-lg rounded-2xl border border-zinc-200 bg-white p-8 text-center">
        <h1 className="text-xl font-bold text-zinc-900">Customers</h1>
        <p className="mt-2 text-sm text-zinc-500">{upgradeMessage("loyalty")}</p>
      </div>
    );
  }

  // Every word must match the first name, last name or phone.
  const words = search.split(/\s+/).filter(Boolean).slice(0, 5);
  const where: Prisma.CustomerWhereInput = {
    tenantId: session.tenantId,
    isActive: !showInactive,
    ...(words.length
      ? {
          AND: words.map((w) => ({
            OR: [
              { firstName: { contains: w, mode: "insensitive" as const } },
              { lastName: { contains: w, mode: "insensitive" as const } },
              { phone: { contains: w } },
            ],
          })),
        }
      : {}),
  };

  const [customers, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: { id: true, firstName: true, lastName: true, phone: true, loyaltyPoints: true },
    }),
    prisma.customer.count({ where }),
  ]);

  // Spent = sales net of returns, voids left out. Last purchase = latest sale (not a return).
  const ids = customers.map((c) => c.id);
  const [spent, last] = ids.length
    ? await Promise.all([
        prisma.sale.groupBy({ by: ["customerId"], where: { tenantId: session.tenantId, customerId: { in: ids }, status: { not: "CANCELLED" } }, _sum: { totalAmount: true } }),
        prisma.sale.groupBy({ by: ["customerId"], where: { tenantId: session.tenantId, customerId: { in: ids }, status: { not: "CANCELLED" }, originalSaleId: null }, _max: { saleDate: true } }),
      ])
    : [[], []];
  const spentBy = new Map(spent.map((s) => [s.customerId, Number(s._sum.totalAmount ?? 0)]));
  const lastBy = new Map(last.map((s) => [s.customerId, s._max.saleDate?.toISOString() ?? null]));

  return shell(
    <CustomersList
      showPoints={loyalty.enabled}
      pesoValuePerPoint={loyalty.pesoValuePerPoint}
      search={search}
      showInactive={showInactive}
      page={page}
      pageCount={Math.max(1, Math.ceil(total / PAGE_SIZE))}
      total={total}
      customers={customers.map((c) => ({
        ...c,
        totalSpent: spentBy.get(c.id) ?? 0,
        lastPurchaseAt: lastBy.get(c.id) ?? null,
      }))}
    />
  );
}
