import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/session";
import { invalidateCached } from "@/lib/route-cache";
import { hasPermission } from "@/lib/permissions";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasPermission(session.tenantId, session.role, "sales_void"))) {
    return NextResponse.json({ error: "You don't have permission to void sales." }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const reason: string | undefined = body?.reason;

  const sale = await prisma.sale.findFirst({
    where: { id, tenantId: session.tenantId },
    include: { items: true, tenant: { select: { timezone: true } } },
  });
  if (!sale) return NextResponse.json({ error: "Sale not found." }, { status: 404 });
  if (sale.status !== "COMPLETED") {
    return NextResponse.json({ error: `Sale is already ${sale.status.toLowerCase()}.` }, { status: 400 });
  }
  if (sale.items.some((item) => item.returnedQuantity > 0)) {
    return NextResponse.json(
      { error: "This sale already has item(s) returned — use a return instead of a full void." },
      { status: 400 }
    );
  }

  const dayKey = (date: Date, timeZone: string) =>
    new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
  const timeZone = sale.tenant.timezone || "Asia/Manila";
  if (dayKey(sale.saleDate, timeZone) !== dayKey(new Date(), timeZone)) {
    return NextResponse.json(
      { error: "This sale is from a previous day — void is only allowed same-day. Use a return instead." },
      { status: 400 }
    );
  }

  try {
    await prisma.$transaction(async (tx) => {
      for (const item of sale.items) {
        await tx.productStock.upsert({
          where: { productId_storeId: { productId: item.productId, storeId: sale.storeId } },
          update: { currentStock: { increment: item.quantity } },
          create: { productId: item.productId, storeId: sale.storeId, currentStock: item.quantity },
        });
      }

      await tx.stockMovement.createMany({
        data: sale.items.map((item) => ({
          tenantId: session.tenantId,
          storeId: sale.storeId,
          type: "RETURN" as const,
          quantity: item.quantity,
          reason: reason ? `Voided sale ${sale.saleNumber}: ${reason}` : `Voided sale ${sale.saleNumber}`,
          reference: sale.saleNumber,
          productId: item.productId,
          userId: session.userId,
        })),
      });

      await tx.sale.update({ where: { id: sale.id }, data: { status: "CANCELLED" } });

      if (sale.prescriptionId) {
        await tx.prescription.update({ where: { id: sale.prescriptionId }, data: { status: "PENDING" } });
      }
    });

    invalidateCached(`products:${session.tenantId}`);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error voiding sale", error);
    return NextResponse.json({ error: "Failed to void sale." }, { status: 500 });
  }
}
