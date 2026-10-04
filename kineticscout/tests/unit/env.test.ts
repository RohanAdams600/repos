import { describe, expect, it } from 'vitest'
import { EnvValidationError, parseServerEnv } from '@/lib/env'

const local = {
  APP_URL: 'http://localhost:3000',
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  SUPABASE_URL: 'https://x.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_xxxxxxxxxxxxxxxx',
  HASH_PEPPER: 'p'.repeat(32),
  INTERNAL_API_SECRET: 's'.repeat(32),
}

const production = {
  ...local,
  NODE_ENV: 'production',
  DEPLOY_ENV: 'production',
  APP_URL: 'https://kineticscout.com',
  SUPABASE_SECRET_KEY: 'sb_secret_xxxxxxxxxxxxxxxxxxxx',
  UPSTASH_REDIS_REST_URL: 'https://x.upstash.io',
  UPSTASH_REDIS_REST_TOKEN: 'token-xxxxxxxx',
  REDIS_URL: 'rediss://default:x@x.upstash.io:6379',
  STRIPE_SECRET_KEY: 'sk_live_xxxxxxxx',
  STRIPE_WEBHOOK_SECRET: 'whsec_xxxxxxxx',
  STRIPE_PRICE_PRO_MONTHLY: 'price_m',
  STRIPE_PRICE_PRO_YEARLY: 'price_y',
  OPENAI_API_KEY: 'sk-xxxxxxxx',
  GCP_PROJECT_ID: 'kinetic-prod',
  GCS_UPLOAD_BUCKET: 'kinetic-uploads',
  RESEND_API_KEY: 're_xxxxxxxx',
  EMAIL_FROM: 'KineticScout <no-reply@kineticscout.com>',
  BUSINESS_LEGAL_NAME: 'Example Sports Analytics LLC',
  BUSINESS_POSTAL_ADDRESS: '100 Main St, Austin, TX 78701',
  BUSINESS_SUPPORT_EMAIL: 'support@kineticscout.com',
  BUSINESS_GOVERNING_LAW: 'the State of Texas',
}

describe('server environment validation', () => {
  it('accepts a minimal local configuration', () => {
    expect(parseServerEnv(local).DEPLOY_ENV).toBe('local')
  })

  it('accepts a complete production configuration', () => {
    expect(parseServerEnv(production).STRIPE_SECRET_KEY).toBe('sk_live_xxxxxxxx')
  })

  it('refuses production without integration secrets and names only the variables', () => {
    try {
      parseServerEnv({ ...local, NODE_ENV: 'production', DEPLOY_ENV: 'production', APP_URL: 'https://kineticscout.com' })
      expect.fail('should throw')
    } catch (error) {
      expect(error).toBeInstanceOf(EnvValidationError)
      const message = (error as Error).message
      expect(message).toContain('STRIPE_SECRET_KEY')
      expect(message).toContain('BUSINESS_LEGAL_NAME')
      expect(message).not.toContain('pppppppp')
    }
  })

  it('refuses insecure or debug production settings', () => {
    expect(() => parseServerEnv({ ...production, APP_URL: 'http://kineticscout.com' })).toThrow(/APP_URL/)
    expect(() => parseServerEnv({ ...production, STRIPE_SECRET_KEY: 'sk_test_x' })).toThrow(/live key/)
    expect(() => parseServerEnv({ ...production, LOG_LEVEL: 'debug' })).toThrow(/debug/)
    expect(() => parseServerEnv({ ...production, REDIS_URL: 'redis://x:6379' })).toThrow(/TLS/)
    expect(() => parseServerEnv({ ...production, ALLOW_TEST_PAYMENTS: 'true' })).toThrow(/ALLOW_TEST_PAYMENTS/)
  })

  it('lets the worker run without web-only secrets', () => {
    const { SUPABASE_PUBLISHABLE_KEY: _k, STRIPE_WEBHOOK_SECRET: _w, STRIPE_PRICE_PRO_MONTHLY: _m, STRIPE_PRICE_PRO_YEARLY: _y, ...rest } = production
    expect(parseServerEnv({ ...rest, SERVICE_ROLE: 'worker' }).SERVICE_ROLE).toBe('worker')
  })

  it('requires the worker to hold the keys it needs to carry out account deletions', () => {
    const { SUPABASE_SECRET_KEY: _s, STRIPE_SECRET_KEY: _st, ...rest } = production
    expect(() => parseServerEnv({ ...rest, SERVICE_ROLE: 'worker' })).toThrow(/SUPABASE_SECRET_KEY[\s\S]*STRIPE_SECRET_KEY|STRIPE_SECRET_KEY[\s\S]*SUPABASE_SECRET_KEY/)
  })

  it('rejects weak peppers', () => {
    expect(() => parseServerEnv({ ...local, HASH_PEPPER: 'short' })).toThrow(/HASH_PEPPER/)
  })
})
