import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/session";
import { buildReceiptDataForSale } from "@/lib/receipt-data";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const receiptData = await buildReceiptDataForSale(id, session.tenantId);
  if (!receiptData) return NextResponse.json({ error: "Sale not found." }, { status: 404 });

  return NextResponse.json(receiptData);
}
