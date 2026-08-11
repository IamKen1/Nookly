import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/session";

export async function GET(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { hasSeenTour: true } });
  return NextResponse.json({ hasSeenTour: user?.hasSeenTour ?? true });
}

export async function POST(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { reset } = await request.json().catch(() => ({ reset: false }));
  await prisma.user.update({ where: { id: session.userId }, data: { hasSeenTour: !reset } });

  return NextResponse.json({ ok: true });
}
