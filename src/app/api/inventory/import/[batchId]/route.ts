import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/session";
import { invalidateCached } from "@/lib/route-cache";

// Undoes an "add new products" import. Only ever deletes products this exact
// batch created, and only those that haven't been sold yet — anything sold
// stays untouched so a receipt/report never loses its underlying product.
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ batchId: string }> }) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { batchId } = await params;
  const batch = await prisma.importBatch.findFirst({ where: { id: batchId, tenantId: session.tenantId } });
  if (!batch) return NextResponse.json({ error: "Import not found." }, { status: 404 });

  const products = await prisma.product.findMany({ where: { importBatchId: batchId }, select: { id: true, name: true } });
  if (products.length === 0) {
    return NextResponse.json({ deletedCount: 0, keptCount: 0, message: "Nothing left to undo — this import's products were already removed or edited away." });
  }

  const soldProductIds = new Set(
    (
      await prisma.saleItem.findMany({
        where: { productId: { in: products.map((p) => p.id) } },
        select: { productId: true },
        distinct: ["productId"],
      })
    ).map((si) => si.productId)
  );

  const deletable = products.filter((p) => !soldProductIds.has(p.id));
  const kept = products.filter((p) => soldProductIds.has(p.id));

  if (deletable.length > 0) {
    await prisma.product.deleteMany({ where: { id: { in: deletable.map((p) => p.id) } } });
    invalidateCached(`products:${session.tenantId}`);
  }

  const message =
    kept.length === 0
      ? `Undone — removed ${deletable.length} product(s) from this import.`
      : `Removed ${deletable.length} product(s). Kept ${kept.length} that already have sales recorded against them: ${kept
          .map((p) => p.name)
          .slice(0, 5)
          .join(", ")}${kept.length > 5 ? ", ..." : ""}.`;

  return NextResponse.json({ deletedCount: deletable.length, keptCount: kept.length, message });
}
