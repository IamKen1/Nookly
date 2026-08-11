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
    const result = await sendScheduledSummaryReports("END_OF_DAY");
    return NextResponse.json(result);
  } catch (error) {
    console.error("Error sending end-of-day summaries:", error);
    return NextResponse.json({ error: "Failed to send end-of-day summaries" }, { status: 500 });
  }
}
