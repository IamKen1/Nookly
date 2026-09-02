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
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const sales = await prisma.sale.findMany({
    where: {
      tenantId: auth.auth.tenantId,
      ...(storeId ? { storeId } : {}),
      ...(from || to
        ? {
            saleDate: {
              ...(from ? { gte: new Date(from) } : {}),
              ...(to ? { lte: new Date(to) } : {}),
            },
          }
        : {}),
    },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    orderBy: { id: "asc" },
    select: {
      id: true,
      saleNumber: true,
      storeId: true,
      subtotal: true,
      taxAmount: true,
      discountAmount: true,
      totalAmount: true,
      paymentMethod: true,
      status: true,
      saleDate: true,
      items: {
        select: { productId: true, quantity: true, unitPrice: true, totalPrice: true },
      },
    },
  });

  const hasMore = sales.length > limit;
  const page = hasMore ? sales.slice(0, limit) : sales;

  return NextResponse.json({
    data: page,
    nextCursor: hasMore ? page[page.length - 1].id : null,
  });
}
