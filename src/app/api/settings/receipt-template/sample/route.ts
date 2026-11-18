import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/session";
import { getSubscriptionWithPlan } from "@/lib/request-cache";
import { getReceiptSettings } from "@/lib/receipt-settings";
import { buildReceiptDataForSale } from "@/lib/receipt-data";
import { sampleReceipt, type SampleKind } from "@/lib/receipt-designer/samples";

// A sale to preview a receipt design with: a made-up one, or the latest real one.
export async function GET(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "OWNER") return NextResponse.json({ error: "Only the owner can design receipts." }, { status: 403 });
  const subscription = await getSubscriptionWithPlan(session.tenantId);
  if (!subscription?.plan.featureReceiptDesigner) return NextResponse.json({ error: "Not included in your plan." }, { status: 403 });

  const kind = new URL(request.url).searchParams.get("kind") ?? "regular";

  if (kind === "recent") {
    const latest = await prisma.sale.findFirst({
      where: { tenantId: session.tenantId, status: "COMPLETED", originalSaleId: null },
      orderBy: { saleDate: "desc" },
      select: { id: true },
    });
    if (!latest) return NextResponse.json({ error: "No sales yet. Pick a sample sale instead." }, { status: 404 });
    return NextResponse.json(await buildReceiptDataForSale(latest.id, session.tenantId));
  }

  if (!["regular", "scpwd", "points", "ewallet"].includes(kind)) return NextResponse.json({ error: "Unknown sample." }, { status: 400 });
  const [store, user, branch] = await Promise.all([
    getReceiptSettings(session.tenantId),
    prisma.user.findUnique({ where: { id: session.userId }, select: { firstName: true, lastName: true } }),
    session.storeId ? prisma.store.findUnique({ where: { id: session.storeId }, select: { name: true } }) : null,
  ]);
  return NextResponse.json(sampleReceipt(kind as SampleKind, store, user ?? { firstName: "Cashier", lastName: "" }, branch?.name ?? null));
}
