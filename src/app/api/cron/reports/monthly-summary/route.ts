import { NextRequest, NextResponse } from "next/server";
import { sendScheduledSummaryReports } from "@/lib/scheduled-reports";

const isAuthorizedCronRequest = (request: NextRequest) => {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return true;
  return request.headers.get("authorization") === `Bearer ${cronSecret}`;
};

export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await sendScheduledSummaryReports("MONTHLY_SUMMARY");
    return NextResponse.json(result);
  } catch (error) {
    console.error("Error sending monthly summaries:", error);
    return NextResponse.json({ error: "Failed to send monthly summaries" }, { status: 500 });
  }
}
