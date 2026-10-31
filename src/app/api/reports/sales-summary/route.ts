import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/session";
import { requireReport } from "@/lib/plan-gating";
import { generateSalesDashboardReport } from "@/lib/reporting";
import { reportStoreId } from "@/lib/branch-scope";
import { hasPermission } from "@/lib/permissions";

export async function GET(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasPermission(session.tenantId, session.role, "reports"))) {
    return NextResponse.json({ error: "You don't have access to Reports." }, { status: 403 });
  }

  const gate = await requireReport(session.tenantId, "overview");
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  try {
    const { searchParams } = new URL(request.url);
    const storeId = reportStoreId(session, searchParams);
    const report = await generateSalesDashboardReport(session.tenantId, searchParams.get("timeZone"), {}, storeId);
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
