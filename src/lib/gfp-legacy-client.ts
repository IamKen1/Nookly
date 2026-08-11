import { PrismaClient as GfpLegacyPrismaClient } from ".prisma/legacy-gfp-client";

const globalForGfp = globalThis as unknown as {
  gfpLegacyClient: GfpLegacyPrismaClient | undefined;
};

// Read-only client against the legacy single-tenant gfp-pos database.
// Only used by the platform admin "migrate gfp-pos data" tool.
export const gfpLegacyClient =
  globalForGfp.gfpLegacyClient ?? new GfpLegacyPrismaClient();

if (process.env.NODE_ENV !== "production") globalForGfp.gfpLegacyClient = gfpLegacyClient;

export const isGfpMigrationConfigured = () => Boolean(process.env.GFP_DATABASE_URL);
