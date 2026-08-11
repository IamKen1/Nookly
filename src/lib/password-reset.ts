import crypto from "crypto";
import { prisma } from "@/lib/prisma";

const TOKEN_TTL_MS = 30 * 60 * 1000; // 30 minutes
const MAX_REQUESTS_PER_WINDOW = 3;
const REQUEST_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

const hashToken = (rawToken: string) => crypto.createHash("sha256").update(rawToken).digest("hex");

// Returns null if this user has requested too many resets recently — caller
// should still respond as if it succeeded, to avoid leaking whether the
// account exists or is being throttled.
export async function issuePasswordResetToken(userId: string): Promise<string | null> {
  const since = new Date(Date.now() - REQUEST_WINDOW_MS);
  const recentCount = await prisma.passwordResetToken.count({
    where: { userId, createdAt: { gte: since } },
  });
  if (recentCount >= MAX_REQUESTS_PER_WINDOW) return null;

  // Invalidate any still-unused tokens so only the newest link works.
  await prisma.passwordResetToken.deleteMany({ where: { userId, usedAt: null } });

  const rawToken = crypto.randomBytes(32).toString("hex");
  await prisma.passwordResetToken.create({
    data: {
      userId,
      tokenHash: hashToken(rawToken),
      expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
    },
  });

  return rawToken;
}

interface TokenLookup {
  ok: boolean;
  userId?: string;
  reason?: "not-found" | "expired" | "used";
}

export async function lookupPasswordResetToken(rawToken: string): Promise<TokenLookup> {
  const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash: hashToken(rawToken) } });
  if (!record) return { ok: false, reason: "not-found" };
  if (record.usedAt) return { ok: false, reason: "used" };
  if (record.expiresAt < new Date()) return { ok: false, reason: "expired" };
  return { ok: true, userId: record.userId };
}

export async function consumePasswordResetToken(rawToken: string): Promise<TokenLookup> {
  const lookup = await lookupPasswordResetToken(rawToken);
  if (!lookup.ok || !lookup.userId) return lookup;

  await prisma.passwordResetToken.update({
    where: { tokenHash: hashToken(rawToken) },
    data: { usedAt: new Date() },
  });
  // Any other still-unused tokens for this user are now moot.
  await prisma.passwordResetToken.deleteMany({ where: { userId: lookup.userId, usedAt: null } });

  return lookup;
}
