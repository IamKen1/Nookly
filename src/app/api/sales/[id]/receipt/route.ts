import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/session";
import { buildReceiptDataForSale } from "@/lib/receipt-data";
import { prisma } from "@/lib/prisma";
import { saleVisibilityWhere } from "@/lib/permissions";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  // Same visibility as the Sales list: a cashier limited to their own sales
  // can't pull up someone else's receipt by ID. (Their own — including the
  // one the POS prints right after checkout — always matches.)
  const visible = await prisma.sale.findFirst({
    where: { id, tenantId: session.tenantId, ...(await saleVisibilityWhere(session)) },
    select: { id: true },
  });
  if (!visible) return NextResponse.json({ error: "Sale not found." }, { status: 404 });

  const receiptData = await buildReceiptDataForSale(id, session.tenantId);
  if (!receiptData) return NextResponse.json({ error: "Sale not found." }, { status: 404 });

  return NextResponse.json(receiptData);
}
