import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/session";
import { ADMIN_RETURN_COOKIE } from "@/lib/platform-admin";

export async function GET(request: NextRequest) {
  const returnToken = request.cookies.get(ADMIN_RETURN_COOKIE)?.value;
  if (!returnToken) return NextResponse.json({ impersonating: false });

  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ impersonating: false });

  const tenant = await prisma.tenant.findUnique({ where: { id: session.tenantId }, select: { name: true } });
  return NextResponse.json({ impersonating: true, tenantName: tenant?.name ?? null });
}
