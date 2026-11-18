import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/session";
import { getLoyaltyConfig } from "@/lib/loyalty";
import { upgradeMessage } from "@/lib/plan-gating";
import { validateRate } from "@/lib/loyalty-math";

// Settings › Loyalty Points. The owner decides whether to use loyalty points
// and sets how they're earned and what they're worth. Offered only when the
// plan includes it.
export async function GET(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "OWNER") return NextResponse.json({ error: "Only the owner can see this." }, { status: 403 });

  const config = await getLoyaltyConfig(session.tenantId);
  return NextResponse.json({
    planHasIt: config.planHasIt,
    enabled: config.enabled,
    pesosPerPoint: config.pesosPerPoint,
    pesoValuePerPoint: config.pesoValuePerPoint,
  });
}

export async function PATCH(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "OWNER") return NextResponse.json({ error: "Only the owner can change this." }, { status: 403 });

  const config = await getLoyaltyConfig(session.tenantId);
  if (!config.planHasIt) return NextResponse.json({ error: upgradeMessage("loyalty") }, { status: 403 });

  const body = (await request.json().catch(() => null)) as {
    enabled?: unknown;
    pesosPerPoint?: unknown;
    pesoValuePerPoint?: unknown;
  } | null;
  if (!body || typeof body.enabled !== "boolean") {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const earn = validateRate(body.pesosPerPoint, "Amount to earn 1 point");
  if (!earn.ok) return NextResponse.json({ error: earn.error }, { status: 400 });
  const worth = validateRate(body.pesoValuePerPoint, "Value of 1 point");
  if (!worth.ok) return NextResponse.json({ error: worth.error }, { status: 400 });

  const data = { enabled: body.enabled, pesosPerPoint: earn.value, pesoValuePerPoint: worth.value };
  const saved = await prisma.loyaltySettings.upsert({
    where: { tenantId: session.tenantId },
    update: data,
    create: { tenantId: session.tenantId, ...data },
  });

  return NextResponse.json({
    planHasIt: true,
    enabled: saved.enabled,
    pesosPerPoint: Number(saved.pesosPerPoint),
    pesoValuePerPoint: Number(saved.pesoValuePerPoint),
  });
}
