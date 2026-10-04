import 'dotenv/config'
import { defineConfig } from 'prisma/config'

// Prisma 7 no longer reads .env automatically; dotenv loads it for CLI commands.
// Migrations must run against a direct (non-pooled) connection.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL ?? '',
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
  },
})
