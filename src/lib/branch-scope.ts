import { cache } from "react";
import type { Prisma } from "@prisma/client";
import type { SessionPayload } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPermissionMatrix } from "@/lib/permissions";

// Where-clause for the batches physically held at a branch. A batch with no
// branch (recorded before branches existed) belongs to the tenant's primary
// branch — main branch first, else the oldest — matching the migration backfill.
// Pass `db` when calling inside a transaction so the lookup uses the same connection.
export async function batchesAtStore(
  tenantId: string,
  storeId: string,
  db: Prisma.TransactionClient = prisma
): Promise<Prisma.ProductBatchWhereInput> {
  const primary = await db.store.findFirst({
    where: { tenantId },
    orderBy: [{ isMainBranch: "desc" }, { createdAt: "asc" }],
    select: { id: true },
  });
  return primary?.id === storeId ? { OR: [{ storeId }, { storeId: null }] } : { storeId };
}

// Branch-related UI only appears once a workspace actually has more than one
// active branch, so single-branch tenants see no change anywhere.
// The store list is memoized per request on tenantId (not the session object),
// so AppShell and the page share one query even though each holds its own
// session copy; `current` is resolved per call from the caller's storeId.
export async function getBranchContext(session: SessionPayload) {
  const stores = (await loadActiveStores(session.tenantId)).map((s) => ({ ...s }));
  const current = stores.find((s) => s.id === session.storeId) ?? null;
  return { stores, current, isMultiBranch: stores.length > 1 };
}

const loadActiveStores = cache((tenantId: string) =>
  prisma.store.findMany({
    where: { tenantId, isActive: true },
    select: { id: true, name: true, isMainBranch: true },
    orderBy: [{ isMainBranch: "desc" }, { createdAt: "asc" }],
  })
);

// Roles that oversee every branch: they can switch their active branch and see
// reports for all branches combined.
export const canManageAllBranches = (role: string) => role === "OWNER" || role === "ADMIN";

// The branch a report should cover. `?branch=all` widens it to every branch
// (owners/admins only); anything else keeps the old behavior of reporting on
// the user's current branch. Returns undefined for "all branches".
export function reportStoreId(session: SessionPayload, searchParams: URLSearchParams): string | undefined {
  if (searchParams.get("branch") === "all" && canManageAllBranches(session.role)) return undefined;
  return session.storeId ?? undefined;
}

// Roles in this workspace allowed to send carts to the cashier queue
// ("Send to cashier" in User Access). The owner isn't counted: they can, but
// that alone shouldn't make every cashier screen poll.
export async function rolesThatSendOrders(tenantId: string): Promise<string[]> {
  const matrix = await getPermissionMatrix(tenantId);
  return Object.entries(matrix)
    .filter(([, m]) => m.pos && m.pos_send_to_cashier)
    .map(([role]) => role);
}

// Whether anyone at this branch sends orders to a cashier. Only then do
// cashier screens poll for waiting orders — every poll is a database read,
// and most workspaces never use orders at all.
export async function branchHasOrderSenders(tenantId: string, storeId: string | null): Promise<boolean> {
  if (!storeId) return false;
  const roles = await rolesThatSendOrders(tenantId);
  if (roles.length === 0) return false;
  const count = await prisma.user.count({ where: { tenantId, storeId, role: { in: roles as never[] }, isActive: true } });
  return count > 0;
}
