import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/session";
import { runInBackground } from "@/lib/background";
import { notifyStockThresholdReached } from "@/lib/notifications";
import { invalidateCached } from "@/lib/route-cache";
import { hasPermission } from "@/lib/permissions";

export async function POST(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.storeId) return NextResponse.json({ error: "No branch assigned to this account." }, { status: 400 });
  if (!(await hasPermission(session.tenantId, session.role, "inventory_adjust"))) {
    return NextResponse.json({ error: "You don't have permission to adjust stock." }, { status: 403 });
  }

  const body = await request.json();
  const { productId, adjustment, reason } = body as { productId: string; adjustment: number; reason?: string };

  if (!productId || adjustment === undefined || adjustment === null) {
    return NextResponse.json({ error: "productId and adjustment are required." }, { status: 400 });
  }
  const qty = Number(adjustment);
  if (!Number.isFinite(qty) || qty === 0) {
    return NextResponse.json({ error: "adjustment must be a non-zero number." }, { status: 400 });
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
      const newStock = previousStock + qty;
      if (newStock < 0) throw new Error("Adjustment would result in negative stock");

      const updatedStock = await tx.productStock.upsert({
        where: { productId_storeId: { productId, storeId: session.storeId! } },
        update: { currentStock: newStock },
        create: { productId, storeId: session.storeId!, currentStock: newStock },
      });

      await tx.stockMovement.create({
        data: {
          tenantId: session.tenantId,
          storeId: session.storeId!,
          productId,
          type: "ADJUSTMENT",
          quantity: qty,
          reason: reason || "Manual stock adjustment",
          userId: session.userId,
        },
      });

      return { previousStock, currentStock: updatedStock.currentStock, product };
    });

    invalidateCached(`products:${session.tenantId}`);
    runInBackground(`stock notification for ${result.product.name}`, () =>
      notifyStockThresholdReached({
        tenantId: session.tenantId,
        productName: result.product.name,
        categoryName: result.product.category?.name,
        previousStock: result.previousStock,
        currentStock: result.currentStock,
        minimumStock: result.product.minimumStock,
        reason: reason || "Manual stock adjustment",
      })
    );

    return NextResponse.json({
      productId,
      previousStock: result.previousStock,
      currentStock: result.currentStock,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to adjust stock";
    const status = message === "Product not found" ? 404 : message.includes("negative") ? 409 : 500;
    if (status === 500) console.error("Error adjusting stock:", error);
    return NextResponse.json({ error: message }, { status });
  }
}
