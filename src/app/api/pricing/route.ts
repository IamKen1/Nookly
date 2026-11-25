import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/session";
import { getPricingRules } from "@/lib/pricing-settings";

// The POS pricing rules checkout applies (formula, cash rounding). Any signed-in
// user can read them: the checkout screen shows the same total the server charges.
export async function GET(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await getPricingRules(session.tenantId), { headers: { "Cache-Control": "no-store" } });
}
