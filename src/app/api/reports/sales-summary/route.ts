import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/session";
import { requireFeature } from "@/lib/plan-gating";
import { generateSalesDashboardReport } from "@/lib/reporting";

export async function GET(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const gate = await requireFeature(session.tenantId, "reports");
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  try {
    const { searchParams } = new URL(request.url);
    const report = await generateSalesDashboardReport(session.tenantId, searchParams.get("timeZone"), {}, session.storeId);
    return NextResponse.json({
      generatedAt: report.generatedAt,
      timeZone: report.timeZone,
      overview: report.overview,
      breakdowns: report.breakdowns,
    });
  } catch (error) {
    console.error("Error generating sales summary report:", error);
    return NextResponse.json({ error: "Failed to generate sales summary report" }, { status: 500 });
  }
}
