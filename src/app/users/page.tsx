import { redirect } from "next/navigation";
import { requireActiveSession } from "@/lib/require-session";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/permissions";
import AppShell from "@/components/app/AppShell";
import UsersClient from "@/components/users/UsersClient";

export default async function UsersPage() {
  const session = await requireActiveSession();
  if (!(await hasPermission(session.tenantId, session.role, "users"))) {
    redirect("/dashboard");
  }

  const [tenant, stores] = await Promise.all([
    prisma.tenant.findUnique({
      where: { id: session.tenantId },
      include: { subscription: { include: { plan: true } } },
    }),
    prisma.store.findMany({ where: { tenantId: session.tenantId, isActive: true }, orderBy: { name: "asc" } }),
  ]);
  if (!tenant) return null;

  return (
    <AppShell tenantName={tenant.name} tenantId={tenant.id} planName={tenant.subscription?.plan.name} role={session.role}>
      <UsersClient
        stores={stores.map((s) => ({ id: s.id, name: s.name }))}
        planName={tenant.subscription?.plan.name ?? ""}
        maxUsers={tenant.subscription?.plan.maxUsers ?? -1}
      />
    </AppShell>
  );
}
