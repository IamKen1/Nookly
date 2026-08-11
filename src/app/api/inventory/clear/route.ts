import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/session";

export async function POST(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "OWNER") {
    return NextResponse.json({ error: "Only the workspace owner can clear inventory." }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  if (body?.confirm !== "CLEAR INVENTORY") {
    return NextResponse.json({ error: 'Type "CLEAR INVENTORY" to confirm this destructive action.' }, { status: 400 });
  }

  const products = await prisma.product.findMany({
    where: { tenantId: session.tenantId },
    select: {
      id: true,
      _count: { select: { saleItems: true, prescriptionItems: true } },
    },
  });

  const deletableIds = products.filter((p) => p._count.saleItems === 0 && p._count.prescriptionItems === 0).map((p) => p.id);
  const protectedIds = products.filter((p) => p._count.saleItems > 0 || p._count.prescriptionItems > 0).map((p) => p.id);

  const result = await prisma.$transaction(async (tx) => {
    let deletedProducts = 0;
    let archivedProducts = 0;

    if (deletableIds.length > 0) {
      await tx.stockMovement.deleteMany({ where: { productId: { in: deletableIds } } });
      await tx.productBatch.deleteMany({ where: { productId: { in: deletableIds } } });
      await tx.productSupplier.deleteMany({ where: { productId: { in: deletableIds } } });
      await tx.productStock.deleteMany({ where: { productId: { in: deletableIds } } });

      const deleted = await tx.product.deleteMany({ where: { id: { in: deletableIds } } });
      deletedProducts = deleted.count;
    }

    if (protectedIds.length > 0) {
      await tx.productStock.updateMany({ where: { productId: { in: protectedIds } }, data: { currentStock: 0 } });
      const archived = await tx.product.updateMany({
        where: { id: { in: protectedIds } },
        data: { minimumStock: 0, maximumStock: null, reorderPoint: 0, isActive: false },
      });
      archivedProducts = archived.count;
    }

    return { deletedProducts, archivedProducts };
  });

  return NextResponse.json({ message: "Inventory clear completed", ...result });
}
