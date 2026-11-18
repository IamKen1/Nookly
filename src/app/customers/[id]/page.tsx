import { notFound } from "next/navigation";
import { requirePagePermission } from "@/lib/require-session";
import { prisma } from "@/lib/prisma";
import { getTenantWithPlan } from "@/lib/request-cache";
import { getLoyaltyConfig } from "@/lib/loyalty";
import { hasPermission } from "@/lib/permissions";
import { upgradeMessage } from "@/lib/plan-gating";
import AppShell from "@/components/app/AppShell";
import CustomerProfile from "@/components/customers/CustomerProfile";

const name = (u: { firstName: string; lastName: string } | null) => (u ? `${u.firstName} ${u.lastName}`.trim() : "");

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePagePermission("customers");
  const { id } = await params;

  const [tenant, loyalty, canAdjust, canSeeSales] = await Promise.all([
    getTenantWithPlan(session.tenantId),
    getLoyaltyConfig(session.tenantId),
    hasPermission(session.tenantId, session.role, "customers_adjust_points"),
    hasPermission(session.tenantId, session.role, "sales"),
  ]);
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

  const customer = await prisma.customer.findFirst({ where: { id, tenantId: session.tenantId } });
  if (!customer) notFound();

  const saleWhere = { tenantId: session.tenantId, customerId: id };
  const [sales, ledger, prescriptions, spent, saleCount] = await Promise.all([
    prisma.sale.findMany({
      where: saleWhere,
      orderBy: { saleDate: "desc" },
      take: 50,
      select: {
        id: true,
        saleNumber: true,
        saleDate: true,
        status: true,
        originalSaleId: true,
        totalAmount: true,
        pointsRedeemed: true,
        pointsEarned: true,
        _count: { select: { items: true } },
        store: { select: { name: true } },
      },
    }),
    prisma.loyaltyTransaction.findMany({
      where: { tenantId: session.tenantId, customerId: id },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        type: true,
        points: true,
        balanceAfter: true,
        reason: true,
        createdAt: true,
        sale: { select: { saleNumber: true } },
        user: { select: { firstName: true, lastName: true } },
      },
    }),
    prisma.prescription.findMany({
      where: { tenantId: session.tenantId, customerId: id },
      orderBy: { writtenDate: "desc" },
      take: 20,
      select: { id: true, prescriptionNumber: true, writtenDate: true, status: true },
    }),
    prisma.sale.aggregate({ where: { ...saleWhere, status: { not: "CANCELLED" } }, _sum: { totalAmount: true } }),
    prisma.sale.count({ where: { ...saleWhere, status: { not: "CANCELLED" }, originalSaleId: null } }),
  ]);

  return shell(
    <CustomerProfile
      showPoints={loyalty.enabled}
      canAdjust={canAdjust && loyalty.active}
      canSeeSales={canSeeSales}
      pesoValuePerPoint={loyalty.pesoValuePerPoint}
      customer={{
        id: customer.id,
        firstName: customer.firstName,
        lastName: customer.lastName,
        phone: customer.phone,
        email: customer.email,
        address: customer.address,
        city: customer.city,
        // Saved as midnight Philippine time; shown and edited as that date.
        dateOfBirth: customer.dateOfBirth ? new Date(customer.dateOfBirth.getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10) : null,
        isActive: customer.isActive,
        loyaltyPoints: customer.loyaltyPoints,
        createdAt: customer.createdAt.toISOString(),
      }}
      stats={{ totalSpent: Number(spent._sum.totalAmount ?? 0), purchases: saleCount }}
      sales={sales.map((s) => ({
        id: s.id,
        saleNumber: s.saleNumber,
        saleDate: s.saleDate.toISOString(),
        status: s.status,
        isReturn: s.originalSaleId != null,
        totalAmount: Number(s.totalAmount),
        pointsRedeemed: s.pointsRedeemed,
        pointsEarned: s.pointsEarned,
        itemCount: s._count.items,
        branch: s.store.name,
      }))}
      ledger={ledger.map((t) => ({
        id: t.id,
        type: t.type,
        points: t.points,
        balanceAfter: t.balanceAfter,
        reason: t.reason,
        createdAt: t.createdAt.toISOString(),
        saleNumber: t.sale?.saleNumber ?? null,
        by: name(t.user),
      }))}
      prescriptions={prescriptions.map((p) => ({ id: p.id, number: p.prescriptionNumber, writtenDate: p.writtenDate.toISOString(), status: p.status }))}
    />
  );
}
