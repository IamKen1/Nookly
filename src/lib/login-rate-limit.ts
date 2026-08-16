import crypto from "crypto";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

const ACCOUNT_WINDOW_MS = 15 * 60 * 1000;
const ACCOUNT_MAX_ATTEMPTS = 5;
const IP_WINDOW_MS = 15 * 60 * 1000;
const IP_MAX_ATTEMPTS = 20;
const CLEANUP_OLDER_THAN_MS = 60 * 60 * 1000; // 1 hour

export const getClientIp = (request: NextRequest): string | null =>
  request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || null;

export const accountKeyFor = (identifier: string) =>
  crypto.createHash("sha256").update(identifier.trim().toLowerCase()).digest("hex");

interface RateLimitResult {
  limited: boolean;
  retryAfterMinutes?: number;
}

// Checked BEFORE looking up the account, so a nonexistent username is
// throttled identically to a real one — the response never reveals which.
export async function checkLoginRateLimit(accountKeyHash: string, ip: string | null): Promise<RateLimitResult> {
  const accountSince = new Date(Date.now() - ACCOUNT_WINDOW_MS);
  const ipSince = new Date(Date.now() - IP_WINDOW_MS);

  // Both counts are independent of each other, so run them concurrently
  // instead of waiting on two sequential round trips to the DB.
  const [accountCount, ipCount] = await Promise.all([
    prisma.loginAttempt.count({ where: { accountKeyHash, createdAt: { gte: accountSince } } }),
    ip ? prisma.loginAttempt.count({ where: { ip, createdAt: { gte: ipSince } } }) : Promise.resolve(0),
  ]);

  if (accountCount >= ACCOUNT_MAX_ATTEMPTS) {
    return { limited: true, retryAfterMinutes: Math.ceil(ACCOUNT_WINDOW_MS / 60000) };
  }
  if (ip && ipCount >= IP_MAX_ATTEMPTS) {
    return { limited: true, retryAfterMinutes: Math.ceil(IP_WINDOW_MS / 60000) };
  }

  return { limited: false };
}

export async function recordFailedLoginAttempt(accountKeyHash: string, ip: string | null) {
  await prisma.loginAttempt.create({ data: { accountKeyHash, ip } });
  // Opportunistic cleanup — keeps the table small without needing a cron job.
  await prisma.loginAttempt.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - CLEANUP_OLDER_THAN_MS) } } }).catch(() => {});
}
