import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/session";
import { hasPermission } from "@/lib/permissions";

// Rename a branch or update its address. Branches are never deleted or
// deactivated here — sales, stock, and shifts all point at them.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasPermission(session.tenantId, session.role, "settings"))) {
    return NextResponse.json({ error: "Only the workspace owner or admin can edit branches." }, { status: 403 });
  }

  const { id } = await params;
  const store = await prisma.store.findFirst({ where: { id, tenantId: session.tenantId } });
  if (!store) return NextResponse.json({ error: "Branch not found." }, { status: 404 });

  const body = await request.json();
  const name = typeof body.name === "string" ? body.name.trim() : undefined;
  if (name === "") return NextResponse.json({ error: "Branch name is required." }, { status: 400 });

  const updated = await prisma.store.update({
    where: { id },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(typeof body.address === "string" ? { address: body.address.trim() || null } : {}),
      ...(typeof body.city === "string" ? { city: body.city.trim() || null } : {}),
    },
  });
  return NextResponse.json(updated);
}
