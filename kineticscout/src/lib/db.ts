import 'server-only'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@/generated/prisma/client'
import { env } from '@/lib/env'

const globalForPrisma = globalThis as unknown as { __kineticDb?: PrismaClient }

function createClient(): PrismaClient {
  const adapter = new PrismaPg({
    connectionString: env().DATABASE_URL,
    // Bounded pool per instance. Serverless instances share a transaction-mode pooler upstream.
    max: Number(process.env.DATABASE_POOL_MAX ?? 10),
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
    // Any single statement running longer than this is cancelled by Postgres.
    statement_timeout: 10_000,
  })
  return new PrismaClient({
    adapter,
    log: env().NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  })
}

/** Lazily constructed so that importing this module never requires DATABASE_URL at build time. */
export function getDb(): PrismaClient {
  globalForPrisma.__kineticDb ??= createClient()
  return globalForPrisma.__kineticDb
}

export const db: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, property, receiver) {
    const client = getDb()
    const value = Reflect.get(client, property, receiver)
    return typeof value === 'function' ? value.bind(client) : value
  },
})

export type { PrismaClient }
export { Prisma } from '@/generated/prisma/client'
