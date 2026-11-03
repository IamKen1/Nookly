import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/session";
import { canManageAllBranches } from "@/lib/branch-scope";
import { invalidateCached } from "@/lib/route-cache";

// Per-branch settings for one product: its price at each branch (null = the
// product's own price) and whether that branch sells it at all.
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageAllBranches(session.role)) {
    return NextResponse.json({ error: "Only owners and admins can set branch prices." }, { status: 403 });
  }

  const { id } = await params;
  const product = await prisma.product.findFirst({ where: { id, tenantId: session.tenantId }, select: { id: true } });
  if (!product) return NextResponse.json({ error: "Product not found." }, { status: 404 });

  const body = await request.json();
  const entries: { storeId: string; price: number | null; sold?: boolean }[] = Array.isArray(body.prices) ? body.prices : [];
  const stores = await prisma.store.findMany({ where: { tenantId: session.tenantId }, select: { id: true } });
  const storeIds = new Set(stores.map((s) => s.id));

  for (const e of entries) {
    if (!storeIds.has(e.storeId)) return NextResponse.json({ error: "Branch not found." }, { status: 400 });
    if (e.price !== null && !(typeof e.price === "number" && Number.isFinite(e.price) && e.price >= 0)) {
      return NextResponse.json({ error: "Prices must be zero or more." }, { status: 400 });
    }
  }

  await prisma.$transaction(
    entries.map((e) => {
      const sellingPrice = e.price === null ? null : new Prisma.Decimal(e.price.toFixed(2));
      const isHidden = e.sold === false;
      return prisma.productStock.upsert({
        where: { productId_storeId: { productId: id, storeId: e.storeId } },
        update: { sellingPrice, isHidden },
        create: { productId: id, storeId: e.storeId, currentStock: 0, sellingPrice, isHidden },
      });
    })
  );

  invalidateCached(`products:${session.tenantId}`);
  return NextResponse.json({ ok: true });
}
