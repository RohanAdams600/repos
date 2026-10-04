import { z } from 'zod'

/**
 * Worker-only settings. Shared settings (database, Redis, OpenAI, storage) come from src/lib/env.ts.
 */
const flag = z
  .enum(['true', 'false'])
  .default('false')
  .transform((v) => v === 'true')

const optional = <T extends z.ZodType<string>>(schema: T) =>
  z.preprocess((value) => (value === '' ? undefined : value), schema.optional())

export const workerEnvSchema = z.object({
  /** IANA time zone the agent schedules are expressed in. */
  AGENT_TIMEZONE: z.string().default('America/New_York'),
  /** Optional dead-man's-switch URL pinged every 5 minutes (e.g. a healthchecks.io check). */
  WORKER_HEARTBEAT_URL: optional(z.url()),

  // Growth agent
  GROWTH_TARGET_REGIONS: z
    .string()
    .default('TX,FL,CA,GA,AZ,NC')
    .transform((v) => v.split(',').map((s) => s.trim().toUpperCase()).filter((s) => /^[A-Z]{2}$/.test(s))),
  /** Auto-approve assets that pass every compliance rule. Approved Meta ads are pushed only if META_AUTOPUBLISH is also true. */
  GROWTH_AUTO_APPROVE: flag,
  X_BEARER_TOKEN: optional(z.string().min(20)),
  META_ACCESS_TOKEN: optional(z.string().min(20)),
  META_APP_SECRET: optional(z.string().min(16)),
  META_AD_ACCOUNT_ID: optional(z.string().regex(/^\d+$/, 'numeric id without the act_ prefix')),
  META_PAGE_ID: optional(z.string().regex(/^\d+$/)),
  /** Existing ad set (budget, schedule and audience are owned by a human in Ads Manager). */
  META_AD_SET_ID: optional(z.string().regex(/^\d+$/)),
  META_GRAPH_VERSION: z.string().regex(/^v\d+\.\d+$/).default('v23.0'),
  META_AUTOPUBLISH: flag,
  /** Ads are created PAUSED unless this is true. */
  META_ADS_AUTO_ACTIVATE: flag,
  /** Refuse to create ads when less than this much of the account spend cap remains. */
  META_MIN_REMAINING_CAP_USD: z.coerce.number().nonnegative().default(50),

  // Data and SEO agent
  /** Minimum athletes per published aggregate (k-anonymity). The database enforces a floor of 10. */
  K_ANONYMITY_MIN: z.coerce.number().int().min(10).default(25),
  /** Publish automatically when every number in the draft traces back to the data snapshot. */
  SEO_AUTOPUBLISH: flag,

  // Retention
  VIDEO_RETENTION_DAYS: z.coerce.number().int().min(30).max(3650).default(365),
})

export type WorkerEnv = z.infer<typeof workerEnvSchema>

let cached: WorkerEnv | undefined
export function workerEnv(): WorkerEnv {
  if (!cached) {
    const parsed = workerEnvSchema.safeParse(process.env)
    if (!parsed.success) {
      throw new Error(`Invalid worker environment:\n  - ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n  - ')}`)
    }
    cached = parsed.data
  }
  return cached
}
