import 'server-only'
import { z } from 'zod'

/**
 * Server environment contract.
 *
 * Nothing in here is exposed to the browser: KineticScout has no NEXT_PUBLIC_ secrets, and
 * authentication runs entirely on the server, so even the Supabase publishable key stays
 * server-side. Integration keys are optional for local development and mandatory once
 * DEPLOY_ENV is staging or production, so a misconfigured deploy fails at boot instead of
 * at the first customer request.
 */

const booleanFlag = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true')

const optionalString = <T extends z.ZodType<string>>(schema: T) =>
  z.preprocess((value) => (value === '' ? undefined : value), schema.optional())

export const serverEnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    DEPLOY_ENV: z.enum(['local', 'staging', 'production']).default('local'),
    /** Which process is booting: the Next.js app or the background worker. */
    SERVICE_ROLE: z.enum(['web', 'worker']).default('web'),
    APP_URL: z.url(),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

    DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\//, 'must be a postgres connection string'),

    SUPABASE_URL: optionalString(z.url()),
    SUPABASE_PUBLISHABLE_KEY: optionalString(z.string().min(20)),
    SUPABASE_SECRET_KEY: optionalString(z.string().min(20)),

    UPSTASH_REDIS_REST_URL: optionalString(z.url()),
    UPSTASH_REDIS_REST_TOKEN: optionalString(z.string().min(10)),
    /** TCP Redis for BullMQ (Upstash rediss:// or self-hosted). */
    REDIS_URL: optionalString(z.string().regex(/^rediss?:\/\//)),

    STRIPE_SECRET_KEY: optionalString(z.string().regex(/^(sk|rk)_(test|live)_/)),
    STRIPE_WEBHOOK_SECRET: optionalString(z.string().startsWith('whsec_')),
    STRIPE_PRICE_PRO_MONTHLY: optionalString(z.string().startsWith('price_')),
    STRIPE_PRICE_PRO_YEARLY: optionalString(z.string().startsWith('price_')),
    /** Enable once Stripe Tax is configured for your registrations; tax is then shown before payment. */
    STRIPE_AUTOMATIC_TAX: booleanFlag,

    OPENAI_API_KEY: optionalString(z.string().startsWith('sk-')),
    OPENAI_MODEL: z.string().min(1).default('gpt-4.1-mini'),
    /** Hard monthly ceiling across every AI feature and agent. */
    AI_GLOBAL_MONTHLY_BUDGET_USD: z.coerce.number().positive().max(100_000).default(250),
    /** Per-user monthly ceiling for user-triggered AI features. */
    AI_USER_MONTHLY_BUDGET_USD: z.coerce.number().positive().max(1_000).default(3),
    /** Model list prices used for cost accounting. Set to your contract prices. */
    OPENAI_INPUT_USD_PER_MTOK: z.coerce.number().positive().default(0.4),
    OPENAI_OUTPUT_USD_PER_MTOK: z.coerce.number().positive().default(1.6),
    /** Video Intelligence person detection list price per minute of video. */
    VIDEO_ANALYSIS_USD_PER_MINUTE: z.coerce.number().positive().default(0.1),
    /** Video Intelligence object tracking, billed in addition to person detection when puck or ball tracking is requested. */
    OBJECT_TRACKING_USD_PER_MINUTE: z.coerce.number().positive().default(0.15),
    /** Pro analyses allowed per user per calendar month (cost ceiling). */
    VIDEO_ANALYSES_PER_MONTH: z.coerce.number().int().positive().max(500).default(30),

    GCP_PROJECT_ID: optionalString(z.string().min(3)),
    GCS_UPLOAD_BUCKET: optionalString(z.string().min(3)),
    /** Base64-encoded service account JSON. Omit to use Application Default Credentials. */
    GCP_SERVICE_ACCOUNT_KEY_B64: optionalString(z.string().min(100)),

    RESEND_API_KEY: optionalString(z.string().startsWith('re_')),
    EMAIL_FROM: z.string().min(3).default('KineticScout <no-reply@localhost>'),

    /** Secret pepper for HMAC hashing of tokens and IP addresses. */
    HASH_PEPPER: z.string().min(32),
    /** Shared secret for worker-to-app calls (cache revalidation). */
    INTERNAL_API_SECRET: z.string().min(32),

    /** Real business identity shown on legal pages, receipts and emails. Required when deployed. */
    BUSINESS_LEGAL_NAME: optionalString(z.string().min(2).max(160)),
    BUSINESS_POSTAL_ADDRESS: optionalString(z.string().min(10).max(300)),
    BUSINESS_SUPPORT_EMAIL: optionalString(z.email()),
    BUSINESS_PHONE: optionalString(z.string().regex(/^\+[1-9]\d{7,14}$/, 'must be E.164, e.g. +15125550123')),
    /** e.g. "the State of Texas". Used in the Terms of Service governing-law clause. */
    BUSINESS_GOVERNING_LAW: optionalString(z.string().min(3).max(80)),

    /** Google Analytics 4 measurement id (G-XXXXXXX). Loaded only after consent, on marketing pages only. */
    GA_MEASUREMENT_ID: optionalString(z.string().regex(/^G-[A-Z0-9]{4,12}$/, 'must look like G-XXXXXXX')),

    /** Allow sk_test_ keys outside local development (staging only). */
    ALLOW_TEST_PAYMENTS: booleanFlag,
    /** Signed-in end-to-end tests without Supabase (see src/lib/auth/e2e-stub.ts). Refused outside DEPLOY_ENV=local. */
    E2E_AUTH_STUB: booleanFlag,
  })
  .superRefine((env, ctx) => {
    const deployed = env.DEPLOY_ENV !== 'local'
    const issue = (path: string, message: string) => ctx.addIssue({ code: 'custom', path: [path], message })
    if (env.E2E_AUTH_STUB && deployed) issue('E2E_AUTH_STUB', 'is only allowed when DEPLOY_ENV=local')

    if (env.SERVICE_ROLE === 'web') {
      if (!env.SUPABASE_URL) issue('SUPABASE_URL', 'required for the web app')
      if (!env.SUPABASE_PUBLISHABLE_KEY) issue('SUPABASE_PUBLISHABLE_KEY', 'required for the web app')
    }

    if (deployed) {
      const webOnly = [
        'SUPABASE_PUBLISHABLE_KEY',
        'UPSTASH_REDIS_REST_URL',
        'UPSTASH_REDIS_REST_TOKEN',
        'STRIPE_WEBHOOK_SECRET',
        'STRIPE_PRICE_PRO_MONTHLY',
        'STRIPE_PRICE_PRO_YEARLY',
        'BUSINESS_LEGAL_NAME',
        'BUSINESS_POSTAL_ADDRESS',
        'BUSINESS_SUPPORT_EMAIL',
        'BUSINESS_GOVERNING_LAW',
      ] as const
      // The worker executes account deletions (Stripe, storage, auth) and sends their confirmation emails.
      const everywhere = [
        'REDIS_URL',
        'OPENAI_API_KEY',
        'GCP_PROJECT_ID',
        'GCS_UPLOAD_BUCKET',
        'SUPABASE_URL',
        'SUPABASE_SECRET_KEY',
        'STRIPE_SECRET_KEY',
        'RESEND_API_KEY',
      ] as const
      const required = env.SERVICE_ROLE === 'web' ? [...webOnly, ...everywhere] : everywhere
      for (const key of required) {
        if (!env[key]) issue(key, `required when DEPLOY_ENV=${env.DEPLOY_ENV}`)
      }
      if (!env.APP_URL.startsWith('https://')) issue('APP_URL', 'must use https outside local development')
      if (env.NODE_ENV !== 'production') issue('NODE_ENV', 'must be production outside local development')
      if (env.REDIS_URL && !env.REDIS_URL.startsWith('rediss://')) issue('REDIS_URL', 'must use TLS (rediss://)')
      if (/localhost|127\.0\.0\.1/.test(env.EMAIL_FROM)) issue('EMAIL_FROM', 'must use a real sending domain')
    }

    if (env.DEPLOY_ENV === 'production') {
      if (env.STRIPE_SECRET_KEY && !/^(sk|rk)_live_/.test(env.STRIPE_SECRET_KEY)) {
        issue('STRIPE_SECRET_KEY', 'production requires a live key')
      }
      if (env.ALLOW_TEST_PAYMENTS) issue('ALLOW_TEST_PAYMENTS', 'must be false in production')
      // Debug and trace logging can leak request payloads.
      if (env.LOG_LEVEL === 'debug' || env.LOG_LEVEL === 'trace') issue('LOG_LEVEL', 'debug logging is disabled in production')
    }

    if (env.DEPLOY_ENV === 'staging' && env.STRIPE_SECRET_KEY?.includes('_test_') && !env.ALLOW_TEST_PAYMENTS) {
      issue('ALLOW_TEST_PAYMENTS', 'set to true to use Stripe test keys in staging')
    }
  })

export type ServerEnv = z.infer<typeof serverEnvSchema>

export class EnvValidationError extends Error {
  constructor(public readonly issues: string[]) {
    // Only variable names and rule descriptions: never echo values.
    super(`Invalid server environment:\n  - ${issues.join('\n  - ')}`)
    this.name = 'EnvValidationError'
  }
}

export function parseServerEnv(source: Record<string, string | undefined>): ServerEnv {
  const result = serverEnvSchema.safeParse(source)
  if (!result.success) {
    throw new EnvValidationError(result.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`))
  }
  return result.data
}

let cached: ServerEnv | undefined

/** Parsed, validated environment. Parsed once per process. */
export function env(): ServerEnv {
  cached ??= parseServerEnv(process.env)
  return cached
}

/** Test hook. */
export function resetEnvCache(): void {
  cached = undefined
}

export class FeatureNotConfiguredError extends Error {
  constructor(feature: string) {
    super(`${feature} is not configured for this environment`)
    this.name = 'FeatureNotConfiguredError'
  }
}

/** Returns the named values or throws FeatureNotConfiguredError if any are missing. */
export function requireEnv<const K extends keyof ServerEnv>(
  feature: string,
  keys: readonly K[],
): { [P in K]-?: NonNullable<ServerEnv[P]> } {
  const e = env()
  const out = {} as { [P in K]-?: NonNullable<ServerEnv[P]> }
  for (const key of keys) {
    const value = e[key]
    if (value === undefined || value === null || value === '') throw new FeatureNotConfiguredError(feature)
    out[key] = value as NonNullable<ServerEnv[typeof key]>
  }
  return out
}
