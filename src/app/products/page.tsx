import { requireSession } from "@/lib/require-session";
import { prisma } from "@/lib/prisma";
import AppShell from "@/components/app/AppShell";
import ProductsClient from "@/components/products/ProductsClient";

export default async function ProductsPage() {
  const session = await requireSession();

  const [tenant, categories] = await Promise.all([
    prisma.tenant.findUnique({
      where: { id: session.tenantId },
      include: { subscription: { include: { plan: true } } },
    }),
    prisma.category.findMany({
      where: { tenantId: session.tenantId, isActive: true },
      orderBy: { name: "asc" },
    }),
  ]);

  if (!tenant) return null;

  return (
    <AppShell tenantName={tenant.name} planName={tenant.subscription?.plan.name} role={session.role}>
      <ProductsClient
        categories={categories.map((c) => ({ id: c.id, name: c.name }))}
        planName={tenant.subscription?.plan.name ?? ""}
        maxProducts={tenant.subscription?.plan.maxProducts ?? -1}
      />
    </AppShell>
  );
}
