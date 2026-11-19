import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/session";
import { getSubscriptionWithPlan } from "@/lib/request-cache";
import { sanitizeTemplate } from "@/lib/receipt-designer/validate";

// One past design from Version history, to restore into the designer as the draft.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "OWNER") return NextResponse.json({ error: "Only the owner can design receipts." }, { status: 403 });
  const subscription = await getSubscriptionWithPlan(session.tenantId);
  if (!subscription?.plan.featureReceiptDesigner) return NextResponse.json({ error: "Not included in your plan." }, { status: 403 });

  const { id } = await params;
  const v = await prisma.receiptTemplateVersion.findFirst({ where: { id, tenantId: session.tenantId } });
  if (!v) return NextResponse.json({ error: "That version isn't available anymore." }, { status: 404 });
  const { template } = sanitizeTemplate({ version: v.version, paperWidth: v.paperWidth, printMode: v.printMode, theme: v.theme, blocks: v.blocks });
  return NextResponse.json({ template, publishedAt: v.publishedAt });
}
