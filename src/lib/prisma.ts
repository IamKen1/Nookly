import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { attachDatabasePool } from '@vercel/functions'
import { Pool } from 'pg'

// Connections go through a node-postgres pool instead of Prisma's built-in
// engine pool. On Vercel Fluid compute an instance is frozen between
// requests; sockets left open across a freeze came back degraded (every
// query on them took ~465–930ms instead of ~3ms). A short idle timeout plus
// attachDatabasePool closes idle connections before the instance is
// suspended, so each request runs on a healthy socket.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
  pgPool: Pool | undefined
}

const pool =
  globalForPrisma.pgPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 5_000,
    connectionTimeoutMillis: 10_000,
    keepAlive: true,
  })

attachDatabasePool(pool)

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter: new PrismaPg(pool),
    log: process.env.NODE_ENV === 'development' ? ['query'] : [],
  })

globalForPrisma.pgPool = pool
globalForPrisma.prisma = prisma
