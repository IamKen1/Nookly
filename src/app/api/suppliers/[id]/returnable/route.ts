import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/session";
import { getRolePermissions } from "@/lib/permissions";
import { batchesAtStore } from "@/lib/branch-scope";

// Lots on the shelf at this branch that can go back to this supplier: ones it
// delivered, plus lots with no supplier recorded. Soonest expiry first.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.storeId) return NextResponse.json({ error: "No branch assigned to this account." }, { status: 400 });
  const p = await getRolePermissions(session.tenantId, session.role);
  if (!p.suppliers || !p.inventory_adjust) return NextResponse.json({ error: "You don't have permission to return stock." }, { status: 403 });

  const { id } = await params;
  const q = new URL(request.url).searchParams.get("q")?.trim();
  const batches = await prisma.productBatch.findMany({
    where: {
      quantity: { gt: 0 },
      OR: [{ supplierId: id }, { supplierId: null }],
      product: { tenantId: session.tenantId, ...(q ? { name: { contains: q, mode: "insensitive" } } : {}) },
      AND: [await batchesAtStore(session.tenantId, session.storeId)],
    },
    include: { product: { select: { name: true, strength: true, dosageForm: true } } },
    orderBy: { expirationDate: "asc" },
    take: 100,
  });
  const now = new Date();
  return NextResponse.json(
    batches.map((b) => ({
      id: b.id,
      name: b.product.name,
      detail: [b.product.strength, b.product.dosageForm].filter(Boolean).join(" · "),
      batchNumber: b.batchNumber,
      expirationDate: b.expirationDate.toISOString(),
      isExpired: b.expirationDate < now,
      quantity: b.quantity,
      unitCost: Number(b.costPrice),
      fromThisSupplier: b.supplierId === id,
    }))
  );
}
