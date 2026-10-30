import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/session";

// Stock of each product at every branch, so staff can see which branch has
// an item before sending a customer elsewhere or requesting a transfer.
export async function GET(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const search = new URL(request.url).searchParams.get("search")?.trim() ?? "";

  const [stores, products] = await Promise.all([
    prisma.store.findMany({
      where: { tenantId: session.tenantId, isActive: true },
      select: { id: true, name: true },
      orderBy: [{ isMainBranch: "desc" }, { createdAt: "asc" }],
    }),
    prisma.product.findMany({
      where: {
        tenantId: session.tenantId,
        isActive: true,
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: "insensitive" } },
                { genericName: { contains: search, mode: "insensitive" } },
                { barcode: { contains: search } },
              ],
            }
          : {}),
      },
      select: { id: true, name: true, minimumStock: true, stocks: { select: { storeId: true, currentStock: true } } },
      orderBy: { name: "asc" },
      take: 100,
    }),
  ]);

  return NextResponse.json({
    stores,
    products: products.map((p) => ({
      id: p.id,
      name: p.name,
      minimumStock: p.minimumStock,
      byStore: Object.fromEntries(stores.map((s) => [s.id, p.stocks.find((st) => st.storeId === s.id)?.currentStock ?? 0])),
    })),
  });
}
