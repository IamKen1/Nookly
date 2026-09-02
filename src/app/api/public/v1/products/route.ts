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

  const products = await prisma.product.findMany({
    where: { tenantId: auth.auth.tenantId, isActive: true },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    orderBy: { id: "asc" },
    select: {
      id: true,
      name: true,
      genericName: true,
      brandName: true,
      barcode: true,
      sku: true,
      costPrice: true,
      sellingPrice: true,
      minimumStock: true,
      maximumStock: true,
      reorderPoint: true,
      requiresPrescription: true,
      isOTC: true,
      category: { select: { name: true } },
      stocks: { select: { storeId: true, currentStock: true } },
    },
  });

  const hasMore = products.length > limit;
  const page = hasMore ? products.slice(0, limit) : products;

  return NextResponse.json({
    data: page,
    nextCursor: hasMore ? page[page.length - 1].id : null,
  });
}
