import 'server-only'
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { env } from '@/lib/env'

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

/** Keyed hash for identifiers we need to correlate but must not store raw (IPs, emails in rate-limit keys). */
export function pepperedHash(value: string): string {
  return createHmac('sha256', env().HASH_PEPPER).update(value, 'utf8').digest('hex')
}

/** URL-safe random token with 256 bits of entropy. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url')
}

export function constantTimeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8')
  const right = Buffer.from(b, 'utf8')
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}
