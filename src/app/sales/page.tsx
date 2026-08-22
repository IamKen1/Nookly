import { requireActiveSession } from "@/lib/require-session";
import { prisma } from "@/lib/prisma";
import { startOfTodayPH } from "@/lib/timezone";
import { hasPermission } from "@/lib/permissions";
import AppShell from "@/components/app/AppShell";
import SalesClient from "@/components/sales/SalesClient";

export default async function SalesPage() {
  const session = await requireActiveSession();

  const tenant = await prisma.tenant.findUnique({
    where: { id: session.tenantId },
    include: { subscription: { include: { plan: true } } },
  });

  if (!tenant) return null;

  const canVoid = await hasPermission(session.tenantId, session.role, "sales_void");

  const [sales, todayAgg] = await Promise.all([
    prisma.sale.findMany({
      where: { tenantId: tenant.id },
      include: { items: { include: { product: true } }, user: true },
      orderBy: { saleDate: "desc" },
      take: 100,
    }),
    // Computed independently from the (capped) list above, on the same PH-day
    // boundary the dashboard uses — so this total is never wrong just because
    // a busy day pushed early sales out of the most-recent-100 window.
    prisma.sale.aggregate({
      where: { tenantId: tenant.id, status: "COMPLETED", saleDate: { gte: startOfTodayPH() } },
      _sum: { totalAmount: true },
    }),
  ]);
  const todayTotal = Number(todayAgg._sum.totalAmount ?? 0);

  return (
    <AppShell tenantName={tenant.name} tenantId={tenant.id} planName={tenant.subscription?.plan.name} role={session.role}>
      <SalesClient
        canVoid={canVoid}
        todayTotal={todayTotal}
        sales={sales.map((s) => ({
          id: s.id,
          saleNumber: s.saleNumber,
          totalAmount: Number(s.totalAmount),
          paymentMethod: s.paymentMethod,
          discountType: s.discountType,
          status: s.status,
          isReturnRecord: Boolean(s.originalSaleId),
          saleDate: s.saleDate.toISOString(),
          cashierName: `${s.user.firstName} ${s.user.lastName}`,
          itemCount: s.items.length,
          items: s.items.map((i) => ({
            id: i.id,
            name: i.product.name,
            quantity: i.quantity,
            returnedQuantity: i.returnedQuantity,
            unitPrice: Number(i.unitPrice),
            totalPrice: Number(i.totalPrice),
          })),
        }))}
      />
    </AppShell>
  );
}
