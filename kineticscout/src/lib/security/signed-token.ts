import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Stateless signed tokens for links that must keep working without a login (email unsubscribe).
 * The signature binds a purpose and a subject, so a token for one purpose or user is useless for any
 * other. Rotating the secret invalidates every outstanding token.
 */
export function signSubject(secret: string, purpose: string, subject: string): string {
  return createHmac('sha256', secret).update(`${purpose}\u0000${subject}`, 'utf8').digest('base64url')
}

export function verifySubject(secret: string, purpose: string, subject: string, token: string): boolean {
  if (!token || token.length > 128) return false
  const expected = Buffer.from(signSubject(secret, purpose, subject))
  const actual = Buffer.from(token)
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}
