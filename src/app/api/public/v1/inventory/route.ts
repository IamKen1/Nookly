import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticatePublicApiRequest } from "@/lib/api-auth";

const MAX_LIMIT = 100;

export async function GET(request: NextRequest) {
  const auth = await authenticatePublicApiRequest(request);
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const limit = Math.min(Number(searchParams.get("limit")) || 50, MAX_LIMIT);
  const cursor = searchParams.get("cursor") || undefined;
  const storeId = searchParams.get("storeId") || undefined;

  const stocks = await prisma.productStock.findMany({
    where: {
      product: { tenantId: auth.auth.tenantId },
      ...(storeId ? { storeId } : {}),
    },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    orderBy: { id: "asc" },
    select: {
      id: true,
      storeId: true,
      currentStock: true,
      updatedAt: true,
      product: {
        select: {
          id: true,
          name: true,
          barcode: true,
          sku: true,
          minimumStock: true,
          reorderPoint: true,
          batches: { select: { batchNumber: true, expirationDate: true, quantity: true } },
        },
      },
    },
  });

  const hasMore = stocks.length > limit;
  const page = hasMore ? stocks.slice(0, limit) : stocks;

  return NextResponse.json({
    data: page,
    nextCursor: hasMore ? page[page.length - 1].id : null,
  });
}
