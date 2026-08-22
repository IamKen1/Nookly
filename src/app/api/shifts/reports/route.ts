import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/session";
import { computeShiftCashReport, type PeriodType } from "@/lib/shift-cash-reports";
import { hasPermission } from "@/lib/permissions";

const VALID_PERIODS: PeriodType[] = ["daily", "weekly", "monthly", "yearly"];

export async function GET(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.storeId) return NextResponse.json({ error: "No branch assigned to this account." }, { status: 400 });
  if (!(await hasPermission(session.tenantId, session.role, "shifts"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const periodParam = searchParams.get("period") ?? "daily";
  const period: PeriodType = VALID_PERIODS.includes(periodParam as PeriodType) ? (periodParam as PeriodType) : "daily";

  const buckets = await computeShiftCashReport(session.tenantId, session.storeId, period);
  return NextResponse.json({ period, buckets });
}
