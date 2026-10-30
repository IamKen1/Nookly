import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/session";
import { hasPermission } from "@/lib/permissions";
import { requireFeature } from "@/lib/plan-gating";
import { invalidateCached } from "@/lib/route-cache";
import { parsePendingItems } from "@/lib/pending-orders";
import { executeTransfer, newTransferReference, prepareTransfer, TransferError } from "@/lib/stock-transfer";

class RequestNoLongerOpen extends Error {}

// approve / decline: by the branch that was asked to send the stock.
// cancel: by the branch that made the request.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.storeId) return NextResponse.json({ error: "No branch assigned to this account." }, { status: 400 });
  if (!(await hasPermission(session.tenantId, session.role, "inventory_adjust"))) {
    return NextResponse.json({ error: "You don't have permission to handle stock requests." }, { status: 403 });
  }
  const gate = await requireFeature(session.tenantId, "multiBranch");
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const { id } = await params;
  const body = await request.json();
  const action = body.action as string;
  const note = typeof body.note === "string" ? body.note.trim() : "";

  const stockRequest = await prisma.stockRequest.findFirst({ where: { id, tenantId: session.tenantId } });
  if (!stockRequest) return NextResponse.json({ error: "Request not found." }, { status: 404 });
  if (stockRequest.status !== "REQUESTED") {
    return NextResponse.json({ error: `This request was already ${stockRequest.status.toLowerCase()}.` }, { status: 409 });
  }

  if (action === "cancel") {
    if (stockRequest.toStoreId !== session.storeId) {
      return NextResponse.json({ error: "Only the branch that made the request can cancel it." }, { status: 403 });
    }
    const done = await prisma.stockRequest.updateMany({
      where: { id, status: "REQUESTED" },
      data: { status: "CANCELLED", handledById: session.userId, handledAt: new Date() },
    });
    if (done.count !== 1) return NextResponse.json({ error: "This request is no longer open." }, { status: 409 });
    return NextResponse.json({ ok: true });
  }

  if (action !== "approve" && action !== "decline") return NextResponse.json({ error: "Invalid action." }, { status: 400 });
  if (stockRequest.fromStoreId !== session.storeId) {
    return NextResponse.json({ error: "Switch to the branch this request was sent to before approving or declining it." }, { status: 403 });
  }

  if (action === "decline") {
    const done = await prisma.stockRequest.updateMany({
      where: { id, status: "REQUESTED" },
      data: { status: "DECLINED", handledById: session.userId, handledAt: new Date(), decisionNote: note || null },
    });
    if (done.count !== 1) return NextResponse.json({ error: "This request is no longer open." }, { status: 409 });
    return NextResponse.json({ ok: true });
  }

  // Approve. The sender may send less than asked (e.g. limited stock), but
  // only products that were in the request; lines set to 0 are left out.
  const requested = parsePendingItems(stockRequest.items);
  const requestedIds = new Set(requested.map((i) => i.productId));
  const items = body.items !== undefined ? parsePendingItems(body.items).filter((i) => requestedIds.has(i.productId)) : requested;
  if (items.length === 0) return NextResponse.json({ error: "Nothing to send. Decline the request instead." }, { status: 400 });

  const prep = await prepareTransfer({ tenantId: session.tenantId, fromStoreId: stockRequest.fromStoreId, toStoreId: stockRequest.toStoreId, items });
  if (!prep.ok) return NextResponse.json({ error: prep.error }, { status: prep.status });
  const reference = newTransferReference();

  try {
    await prisma.$transaction(
      async (tx) => {
        const claimed = await tx.stockRequest.updateMany({
          where: { id, status: "REQUESTED" },
          data: { status: "APPROVED", handledById: session.userId, handledAt: new Date(), decisionNote: note || null, transferReference: reference },
        });
        if (claimed.count !== 1) throw new RequestNoLongerOpen();
        await executeTransfer(tx, {
          tenantId: session.tenantId,
          userId: session.userId,
          fromStore: prep.fromStore,
          toStore: prep.toStore,
          items,
          productNames: prep.productNames,
          reference,
          notes: `Stock request ${stockRequest.requestNumber}`,
        });
      },
      { timeout: 30000, maxWait: 10000 }
    );
  } catch (error) {
    if (error instanceof TransferError) return NextResponse.json({ error: error.message }, { status: 409 });
    if (error instanceof RequestNoLongerOpen) return NextResponse.json({ error: "This request is no longer open." }, { status: 409 });
    throw error;
  }

  invalidateCached(`products:${session.tenantId}`);
  return NextResponse.json({ ok: true, reference });
}
