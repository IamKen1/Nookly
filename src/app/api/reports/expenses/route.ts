import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/session";
import { requireFeature } from "@/lib/plan-gating";

export async function GET(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const gate = await requireFeature(session.tenantId, "reports");
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    const dateFilter: Record<string, Date> = {};
    if (startDate) dateFilter.gte = new Date(`${startDate}T00:00:00`);
    if (endDate) dateFilter.lte = new Date(`${endDate}T23:59:59`);

    const expenses = await prisma.shiftExpense.findMany({
      where: {
        tenantId: session.tenantId,
        ...(session.storeId ? { shift: { storeId: session.storeId } } : {}),
        ...(Object.keys(dateFilter).length > 0 ? { createdAt: dateFilter } : {}),
      },
      select: {
        id: true,
        description: true,
        amount: true,
        createdAt: true,
        shift: {
          select: {
            store: { select: { name: true } },
            user: { select: { firstName: true, lastName: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const totalAmount = expenses.reduce((sum, e) => sum + Number(e.amount), 0);

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      filters: { startDate: startDate || null, endDate: endDate || null },
      summary: { count: expenses.length, totalAmount },
      rows: expenses.map((e) => ({
        id: e.id,
        description: e.description,
        amount: Number(e.amount),
        createdAt: e.createdAt.toISOString(),
        storeName: e.shift.store?.name ?? null,
        cashierName: e.shift.user ? `${e.shift.user.firstName} ${e.shift.user.lastName}` : null,
      })),
    });
  } catch (error) {
    console.error("Error generating expenses report:", error);
    return NextResponse.json({ error: "Failed to generate expenses report" }, { status: 500 });
  }
}
