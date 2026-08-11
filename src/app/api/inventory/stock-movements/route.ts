import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/session";
import { runInBackground } from "@/lib/background";
import { notifyStockThresholdReached } from "@/lib/notifications";

type MovementType = "PURCHASE" | "SALE" | "ADJUSTMENT" | "RETURN" | "EXPIRED" | "DAMAGED" | "TRANSFER";

export async function POST(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.storeId) return NextResponse.json({ error: "No branch assigned to this account." }, { status: 400 });

  const body = await request.json();
  const { productId, type, quantity, reason, reference, notes } = body as {
    productId: string;
    type: MovementType;
    quantity: number;
    reason?: string;
    reference?: string;
    notes?: string;
  };

  if (!productId || !type || quantity === undefined || quantity === null) {
    return NextResponse.json({ error: "productId, type and quantity are required." }, { status: 400 });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const product = await tx.product.findFirst({
        where: { id: productId, tenantId: session.tenantId },
        include: { category: { select: { name: true } } },
      });
      if (!product) throw new Error("Product not found");

      const stock = await tx.productStock.findUnique({
        where: { productId_storeId: { productId, storeId: session.storeId! } },
      });
      const previousStock = stock?.currentStock ?? 0;

      let delta = 0;
      if (type === "PURCHASE" || type === "ADJUSTMENT" || type === "RETURN") {
        delta = quantity;
      } else if (type === "SALE" || type === "EXPIRED" || type === "DAMAGED") {
        delta = -Math.abs(quantity);
      } else if (type === "TRANSFER") {
        delta = quantity;
      }

      const newStock = previousStock + delta;
      if (newStock < 0) throw new Error("Movement would result in negative stock");

      const updatedStock = await tx.productStock.upsert({
        where: { productId_storeId: { productId, storeId: session.storeId! } },
        update: { currentStock: newStock },
        create: { productId, storeId: session.storeId!, currentStock: newStock },
      });

      const movement = await tx.stockMovement.create({
        data: {
          tenantId: session.tenantId,
          storeId: session.storeId!,
          productId,
          type,
          quantity,
          reason,
          reference,
          notes,
          userId: session.userId,
        },
      });

      return { movement, previousStock, currentStock: updatedStock.currentStock, product };
    });

    runInBackground(`stock notification for ${result.product.name}`, () =>
      notifyStockThresholdReached({
        tenantId: session.tenantId,
        productName: result.product.name,
        categoryName: result.product.category?.name,
        previousStock: result.previousStock,
        currentStock: result.currentStock,
        minimumStock: result.product.minimumStock,
        reason: reason || type,
      })
    );

    return NextResponse.json(result.movement, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create stock movement";
    const status = message === "Product not found" ? 404 : message.includes("negative") ? 409 : 500;
    if (status === 500) console.error("Error creating stock movement:", error);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function GET(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const productId = searchParams.get("productId");
  const type = searchParams.get("type");

  const movements = await prisma.stockMovement.findMany({
    where: {
      tenantId: session.tenantId,
      ...(session.storeId ? { storeId: session.storeId } : {}),
      ...(productId ? { productId } : {}),
      ...(type ? { type: type as MovementType } : {}),
    },
    include: {
      product: { select: { id: true, name: true, barcode: true, sku: true } },
      user: { select: { id: true, firstName: true, lastName: true, username: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return NextResponse.json(movements);
}
