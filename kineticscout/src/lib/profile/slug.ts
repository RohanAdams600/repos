import { randomBytes } from 'node:crypto'

/** Lowercase letters and digits without look-alikes (no 0/o, 1/l/i). */
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'

/**
 * Public profile link: the athlete's first name plus 8 random characters (about 40 bits), so links
 * cannot be enumerated and a last name never appears in the URL.
 */
export function makeProfileSlug(firstName: string, bytes: Uint8Array = randomBytes(8)): string {
  const name = firstName
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z]+/g, '')
    .slice(0, 20)
  const suffix = Array.from(bytes.slice(0, 8), (b) => ALPHABET[b % ALPHABET.length]).join('')
  return name ? `${name}-${suffix}` : `athlete-${suffix}`
}

export function isProfileSlug(value: string): boolean {
  return /^[a-z]{1,20}-[a-z2-9]{8}$/.test(value)
}
