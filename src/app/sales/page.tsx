import { requireActiveSession } from "@/lib/require-session";
import { prisma } from "@/lib/prisma";
import AppShell from "@/components/app/AppShell";
import SalesClient from "@/components/sales/SalesClient";

export default async function SalesPage() {
  const session = await requireActiveSession();

  const tenant = await prisma.tenant.findUnique({
    where: { id: session.tenantId },
    include: { subscription: { include: { plan: true } } },
  });

  if (!tenant) return null;

  const sales = await prisma.sale.findMany({
    where: { tenantId: tenant.id },
    include: { items: { include: { product: true } }, user: true },
    orderBy: { saleDate: "desc" },
    take: 100,
  });

  return (
    <AppShell tenantName={tenant.name} planName={tenant.subscription?.plan.name} role={session.role}>
      <SalesClient
        canVoid={["OWNER", "ADMIN", "MANAGER"].includes(session.role)}
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
