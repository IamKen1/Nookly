import type { Prisma } from "@prisma/client";
import type { SessionPayload } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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
export async function getBranchContext(session: SessionPayload) {
  const stores = await prisma.store.findMany({
    where: { tenantId: session.tenantId, isActive: true },
    select: { id: true, name: true, isMainBranch: true },
    orderBy: [{ isMainBranch: "desc" }, { createdAt: "asc" }],
  });
  const current = stores.find((s) => s.id === session.storeId) ?? null;
  return { stores, current, isMultiBranch: stores.length > 1 };
}

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
