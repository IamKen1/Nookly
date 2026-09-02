import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/api-keys";
import { getTenantPlanCode, hasFeature } from "@/lib/plan-gating";

export interface PublicApiAuth {
  tenantId: string;
}

// Shared guard for every /api/public/v1/* route. Re-checks the plan's
// featureApiAccess on every request (not just at key-creation time) so a
// tenant that downgrades off Empire loses API access immediately, without
// needing to revoke their existing keys.
export async function authenticatePublicApiRequest(
  request: NextRequest
): Promise<{ ok: true; auth: PublicApiAuth } | { ok: false; response: NextResponse }> {
  const authHeader = request.headers.get("authorization") ?? "";
  const rawKey = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : "";

  if (!rawKey) {
    return { ok: false, response: NextResponse.json({ error: "Missing API key. Pass it as 'Authorization: Bearer <key>'." }, { status: 401 }) };
  }

  const auth = await authenticateApiKey(rawKey);
  if (!auth) {
    return { ok: false, response: NextResponse.json({ error: "Invalid or revoked API key." }, { status: 401 }) };
  }

  const planCode = await getTenantPlanCode(auth.tenantId);
  if (!(await hasFeature(planCode, "apiAccess"))) {
    return { ok: false, response: NextResponse.json({ error: "API access isn't included in this account's current plan." }, { status: 403 }) };
  }

  return { ok: true, auth };
}
