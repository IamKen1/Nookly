import { Prisma } from "@prisma/client";
import { requireActiveSession } from "@/lib/require-session";
import { prisma } from "@/lib/prisma";
import { startOfTodayPH, startOfDatePH, endOfDatePH } from "@/lib/timezone";
import { hasPermission } from "@/lib/permissions";
import AppShell from "@/components/app/AppShell";
import SalesClient from "@/components/sales/SalesClient";

export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await requireActiveSession();
  const params = await searchParams;
  const asString = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || "";

  const dateFrom = asString(params.dateFrom);
  const dateTo = asString(params.dateTo);
  const cashierId = asString(params.cashierId);
  const paymentMethod = asString(params.paymentMethod);
  const status = asString(params.status);
  const search = asString(params.search).trim();

  const tenant = await prisma.tenant.findUnique({
    where: { id: session.tenantId },
    include: { subscription: { include: { plan: true } } },
  });

  if (!tenant) return null;

  const canVoid = await hasPermission(session.tenantId, session.role, "sales_void");

  const where: Prisma.SaleWhereInput = { tenantId: tenant.id };
  if (dateFrom) where.saleDate = { ...(where.saleDate as object), gte: startOfDatePH(dateFrom) };
  if (dateTo) where.saleDate = { ...(where.saleDate as object), lt: endOfDatePH(dateTo) };
  if (cashierId) where.userId = cashierId;
  if (paymentMethod) where.paymentMethod = paymentMethod as Prisma.SaleWhereInput["paymentMethod"];
  if (status) where.status = status as Prisma.SaleWhereInput["status"];
  if (search) where.saleNumber = { contains: search, mode: "insensitive" };

  const [sales, todayAgg, cashiers] = await Promise.all([
    prisma.sale.findMany({
      where,
      include: { items: { include: { product: true } }, user: true },
      orderBy: { saleDate: "desc" },
      take: 100,
    }),
    // Computed independently of the filtered/capped list above, on the same
    // PH-day boundary the dashboard uses — the "Today's total" stat always
    // reflects the real day, regardless of what filters are applied to the
    // table below it.
    prisma.sale.aggregate({
      where: { tenantId: tenant.id, status: "COMPLETED", saleDate: { gte: startOfTodayPH() } },
      _sum: { totalAmount: true },
    }),
    prisma.user.findMany({
      where: { tenantId: tenant.id, isActive: true },
      select: { id: true, firstName: true, lastName: true },
      orderBy: { firstName: "asc" },
    }),
  ]);
  const todayTotal = Number(todayAgg._sum.totalAmount ?? 0);

  return (
    <AppShell tenantName={tenant.name} tenantId={tenant.id} planName={tenant.subscription?.plan.name} role={session.role}>
      <SalesClient
        canVoid={canVoid}
        todayTotal={todayTotal}
        cashiers={cashiers.map((c) => ({ id: c.id, name: `${c.firstName} ${c.lastName}`.trim() }))}
        filters={{ dateFrom, dateTo, cashierId, paymentMethod, status, search }}
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
