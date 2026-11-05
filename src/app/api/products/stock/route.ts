import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/session";

// This branch's stock for the given products, as { productId: stock }. One query,
// so the POS can bring a long list up to date without fetching each page again.
// A product with no stock row here has none in stock, so it comes back as 0.
export async function POST(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.storeId) return NextResponse.json({});

  const body = await request.json().catch(() => null);
  const ids: string[] = Array.isArray(body?.ids) ? body.ids.filter((id: unknown) => typeof id === "string").slice(0, 5000) : [];
  if (ids.length === 0) return NextResponse.json({});

  const stocks = await prisma.productStock.findMany({
    where: { storeId: session.storeId, productId: { in: ids }, product: { tenantId: session.tenantId } },
    select: { productId: true, currentStock: true },
  });
  const byId = new Map(stocks.map((s) => [s.productId, s.currentStock]));
  return NextResponse.json(Object.fromEntries(ids.map((id) => [id, byId.get(id) ?? 0])));
}
