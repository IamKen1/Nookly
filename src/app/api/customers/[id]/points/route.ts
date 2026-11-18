import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/session";
import { hasPermission } from "@/lib/permissions";
import { applyPoints, CustomerNotFoundError, getLoyaltyConfig, InsufficientPointsError } from "@/lib/loyalty";

// Add or remove a customer's points by hand (e.g. points carried over from an
// old card, or fixing a mistake). Always needs a reason, kept in the history.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasPermission(session.tenantId, session.role, "customers_adjust_points"))) {
    return NextResponse.json({ error: "You don't have permission to adjust points." }, { status: 403 });
  }
  const loyalty = await getLoyaltyConfig(session.tenantId);
  if (!loyalty.active) {
    return NextResponse.json({ error: "Loyalty points are turned off. The owner can turn them on in Settings › Loyalty points." }, { status: 403 });
  }

  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { points?: unknown; reason?: unknown } | null;
  const points = Number(body?.points);
  const reason = typeof body?.reason === "string" ? body.reason.trim().slice(0, 300) : "";
  if (!Number.isInteger(points) || points === 0) {
    return NextResponse.json({ error: "Enter a whole number of points to add or remove." }, { status: 400 });
  }
  if (Math.abs(points) > 1_000_000) return NextResponse.json({ error: "That's too many points." }, { status: 400 });
  if (!reason) return NextResponse.json({ error: "Enter a reason for the adjustment." }, { status: 400 });

  try {
    const result = await prisma.$transaction((tx) =>
      applyPoints(tx, { tenantId: session.tenantId, customerId: id, userId: session.userId, type: "ADJUST", points, reason })
    );
    return NextResponse.json({ ok: true, balance: result!.balanceAfter });
  } catch (error) {
    if (error instanceof InsufficientPointsError) {
      return NextResponse.json({ error: `The customer only has ${error.balance} points.` }, { status: 400 });
    }
    if (error instanceof CustomerNotFoundError) return NextResponse.json({ error: "Customer not found." }, { status: 404 });
    throw error;
  }
}
