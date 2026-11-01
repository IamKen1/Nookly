import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/session";

// Stock and price of a few products at every branch that sells them, for the
// price check ("we're out here, but Marilao has 12"). Read-only, so every user
// of the workspace may use it, unlike the inventory branch view.
export async function GET(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ids = (new URL(request.url).searchParams.get("ids") ?? "").split(",").filter(Boolean).slice(0, 20);
  if (ids.length === 0) return NextResponse.json({});

  const [stores, products] = await Promise.all([
    prisma.store.findMany({
      where: { tenantId: session.tenantId, isActive: true },
      select: { id: true, name: true },
      orderBy: [{ isMainBranch: "desc" }, { createdAt: "asc" }],
    }),
    prisma.product.findMany({
      where: { id: { in: ids }, tenantId: session.tenantId },
      select: { id: true, sellingPrice: true, stocks: { select: { storeId: true, currentStock: true, sellingPrice: true, isHidden: true } } },
    }),
  ]);

  return NextResponse.json(
    Object.fromEntries(
      products.map((p) => [
        p.id,
        stores
          .map((s) => {
            const st = p.stocks.find((x) => x.storeId === s.id);
            if (st?.isHidden) return null; // this branch doesn't carry it
            return {
              storeId: s.id,
              name: s.name,
              isCurrent: s.id === session.storeId,
              stock: Math.max(0, st?.currentStock ?? 0),
              price: Number(st?.sellingPrice ?? p.sellingPrice),
            };
          })
          .filter(Boolean),
      ])
    )
  );
}
