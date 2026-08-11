import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { SessionPayload } from "@/lib/auth";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";

// Bootstrap admins — configured via env so access can never be fully locked out
// even if the DB-managed admin list is emptied by mistake.
const ENV_ADMIN_EMAILS = (process.env.PLATFORM_ADMIN_EMAILS || "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

// Plain list of bootstrap admin emails for outbound notifications (e.g. new plan-change
// requests) — distinct from the access-control checks below.
export const platformAdminRecipients = ENV_ADMIN_EMAILS;

export const ADMIN_UNLOCK_COOKIE = "nookly_admin_unlock";
export const ADMIN_RETURN_COOKIE = "nookly_admin_return";
const UNLOCK_TTL = "12h";

export async function isPlatformAdmin(session: SessionPayload): Promise<{ ok: boolean; email: string | null }> {
  const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { email: true, isPlatformAdmin: true } });
  if (!user) return { ok: false, email: null };
  const email = user.email.toLowerCase();
  const ok = user.isPlatformAdmin || ENV_ADMIN_EMAILS.includes(email);
  return { ok, email: user.email };
}

export function isEnvBootstrapAdmin(email: string): boolean {
  return ENV_ADMIN_EMAILS.includes(email.toLowerCase());
}

export function signAdminUnlockToken(): string {
  return jwt.sign({ unlocked: true }, JWT_SECRET, { expiresIn: UNLOCK_TTL });
}

export function verifyAdminUnlockToken(token: string | undefined): boolean {
  if (!token) return false;
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { unlocked?: boolean };
    return Boolean(payload.unlocked);
  } catch {
    return false;
  }
}

export function isAdminAccessKeyConfigured(): boolean {
  return Boolean(process.env.ADMIN_ACCESS_KEY);
}

export function verifyAdminAccessKey(passphrase: string): boolean {
  const configured = process.env.ADMIN_ACCESS_KEY;
  return Boolean(configured) && passphrase === configured;
}

interface AdminAccessResult {
  ok: boolean;
  email: string | null;
  reason?: "not-admin" | "locked";
}

// Two-factor-ish gate: must be flagged as a platform admin AND have separately
// unlocked the console with the passphrase. Either one alone is not enough.
export async function requireAdminAccessServer(session: SessionPayload): Promise<AdminAccessResult> {
  const admin = await isPlatformAdmin(session);
  if (!admin.ok) return { ok: false, email: admin.email, reason: "not-admin" };
  const cookieStore = await cookies();
  const unlockToken = cookieStore.get(ADMIN_UNLOCK_COOKIE)?.value;
  if (!verifyAdminUnlockToken(unlockToken)) return { ok: false, email: admin.email, reason: "locked" };
  return { ok: true, email: admin.email };
}

export async function requireAdminAccessRequest(request: NextRequest, session: SessionPayload): Promise<AdminAccessResult> {
  const admin = await isPlatformAdmin(session);
  if (!admin.ok) return { ok: false, email: admin.email, reason: "not-admin" };
  const unlockToken = request.cookies.get(ADMIN_UNLOCK_COOKIE)?.value;
  if (!verifyAdminUnlockToken(unlockToken)) return { ok: false, email: admin.email, reason: "locked" };
  return { ok: true, email: admin.email };
}

export async function logAdminAction(params: {
  actorUserId: string;
  actorEmail: string;
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
}) {
  await prisma.adminAuditLog.create({
    data: {
      actorUserId: params.actorUserId,
      actorEmail: params.actorEmail,
      action: params.action,
      targetType: params.targetType,
      targetId: params.targetId,
      metadata: params.metadata as Prisma.InputJsonValue | undefined,
    },
  });
}
