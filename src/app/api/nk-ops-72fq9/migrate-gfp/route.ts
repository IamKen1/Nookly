import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/session";
import { requireAdminAccessRequest, logAdminAction } from "@/lib/platform-admin";
import { isGfpMigrationConfigured } from "@/lib/gfp-legacy-client";
import { migrateGfpDataToTenant } from "@/lib/gfp-migration";

export async function POST(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const access = await requireAdminAccessRequest(request, session);
  if (!access.ok) return NextResponse.json({ error: "Forbidden", reason: access.reason }, { status: 403 });

  if (!isGfpMigrationConfigured()) {
    return NextResponse.json({ error: "GFP_DATABASE_URL is not configured on this environment." }, { status: 503 });
  }

  const { tenantId } = await request.json();
  if (!tenantId) return NextResponse.json({ error: "tenantId is required." }, { status: 400 });

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) return NextResponse.json({ error: "Tenant not found." }, { status: 404 });

  try {
    const summary = await migrateGfpDataToTenant(tenantId);

    await logAdminAction({
      actorUserId: session.userId,
      actorEmail: access.email || "unknown",
      action: "gfp_data_migrated",
      targetType: "Tenant",
      targetId: tenantId,
      metadata: {
        tenantName: tenant.name,
        totals: summary.tables.map((t) => ({ table: t.table, created: t.created, updated: t.updated, failed: t.failed })),
      },
    });

    return NextResponse.json(summary);
  } catch (error) {
    console.error("gfp-pos migration failed", error);
    const message = error instanceof Error ? error.message : "Migration failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
