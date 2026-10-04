import { signSubject, verifySubject } from '@/lib/security/signed-token'

/**
 * Test-only sign-in for end-to-end tests that cannot reach Supabase.
 *
 * Active only when E2E_AUTH_STUB=true AND DEPLOY_ENV=local. Startup validation (env.ts) refuses the
 * flag anywhere else, and this check repeats the condition at runtime, so a deployed environment
 * can never accept the cookie. The cookie value is "<user id>.<HMAC of the id with HASH_PEPPER>",
 * so it cannot be forged without the server secret.
 */

export const E2E_SESSION_COOKIE = 'ks_e2e_session'
const PURPOSE = 'e2e-session-v1'

export function e2eStubEnabled(): boolean {
  return process.env.E2E_AUTH_STUB === 'true' && (process.env.DEPLOY_ENV ?? 'local') === 'local'
}

export function e2eSessionValue(userId: string, secret: string): string {
  return `${userId}.${signSubject(secret, PURPOSE, userId)}`
}

export function readE2eSession(value: string | undefined, secret: string | undefined): string | null {
  if (!value || !secret || !e2eStubEnabled()) return null
  const dot = value.indexOf('.')
  if (dot <= 0) return null
  const userId = value.slice(0, dot)
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return null
  return verifySubject(secret, PURPOSE, userId, value.slice(dot + 1)) ? userId : null
}
