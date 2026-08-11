import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";
import { lookupPasswordResetToken, consumePasswordResetToken } from "@/lib/password-reset";

const REASON_MESSAGES: Record<string, string> = {
  "not-found": "This reset link is invalid.",
  expired: "This reset link has expired. Request a new one.",
  used: "This reset link has already been used.",
};

export async function GET(request: NextRequest) {
  const token = new URL(request.url).searchParams.get("token");
  if (!token) return NextResponse.json({ valid: false, error: "Missing token." }, { status: 400 });

  const lookup = await lookupPasswordResetToken(token);
  if (!lookup.ok) {
    return NextResponse.json({ valid: false, error: REASON_MESSAGES[lookup.reason ?? "not-found"] }, { status: 400 });
  }
  return NextResponse.json({ valid: true });
}

export async function POST(request: NextRequest) {
  const { token, password, confirmPassword } = await request.json();

  if (!token || !password) {
    return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
  }
  if (password !== confirmPassword) {
    return NextResponse.json({ error: "Passwords don't match." }, { status: 400 });
  }

  const consumed = await consumePasswordResetToken(token);
  if (!consumed.ok || !consumed.userId) {
    return NextResponse.json({ error: REASON_MESSAGES[consumed.reason ?? "not-found"] }, { status: 400 });
  }

  const passwordHash = await hashPassword(password);
  await prisma.user.update({ where: { id: consumed.userId }, data: { password: passwordHash } });

  return NextResponse.json({ ok: true });
}
