import crypto from "crypto";
import { prisma } from "@/lib/prisma";

const KEY_PREFIX = "nk_live_";
const MAX_KEYS_PER_TENANT = 5;

const hashKey = (rawKey: string) => crypto.createHash("sha256").update(rawKey).digest("hex");

export interface ApiKeySummary {
  id: string;
  name: string;
  keyPrefix: string;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}

export async function listApiKeys(tenantId: string): Promise<ApiKeySummary[]> {
  return prisma.apiKey.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, keyPrefix: true, lastUsedAt: true, revokedAt: true, createdAt: true },
  });
}

// Returns the raw key exactly once — only its hash is persisted, so it can
// never be shown again after this call returns.
export async function createApiKey(
  tenantId: string,
  createdByUserId: string,
  name: string
): Promise<{ ok: true; rawKey: string; key: ApiKeySummary } | { ok: false; error: string }> {
  const activeCount = await prisma.apiKey.count({ where: { tenantId, revokedAt: null } });
  if (activeCount >= MAX_KEYS_PER_TENANT) {
    return { ok: false, error: `You can have at most ${MAX_KEYS_PER_TENANT} active API keys. Revoke one first.` };
  }

  const rawKey = `${KEY_PREFIX}${crypto.randomBytes(24).toString("hex")}`;
  const key = await prisma.apiKey.create({
    data: {
      tenantId,
      createdByUserId,
      name: name.trim() || "Untitled key",
      keyPrefix: rawKey.slice(0, KEY_PREFIX.length + 6),
      keyHash: hashKey(rawKey),
    },
    select: { id: true, name: true, keyPrefix: true, lastUsedAt: true, revokedAt: true, createdAt: true },
  });

  return { ok: true, rawKey, key };
}

export async function revokeApiKey(tenantId: string, keyId: string): Promise<boolean> {
  const result = await prisma.apiKey.updateMany({
    where: { id: keyId, tenantId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return result.count > 0;
}

// Looks up a raw API key presented on an incoming public-API request. Updates
// lastUsedAt best-effort (fire-and-forget) so a lookup never gets slower as
// usage grows, and a logging failure never blocks the actual request.
export async function authenticateApiKey(rawKey: string): Promise<{ tenantId: string } | null> {
  const record = await prisma.apiKey.findUnique({
    where: { keyHash: hashKey(rawKey) },
    select: { id: true, tenantId: true, revokedAt: true },
  });
  if (!record || record.revokedAt) return null;

  prisma.apiKey.update({ where: { id: record.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
  return { tenantId: record.tenantId };
}
