import { createCipheriv, createECDH, createHmac, createPrivateKey, randomBytes, sign } from 'node:crypto'

/**
 * Web Push without a third-party library: payload encryption (RFC 8291, "aes128gcm" from RFC 8188)
 * and VAPID authentication (RFC 8292), using node:crypto only.
 *
 * Subscription endpoints come from browsers, which means from users, so they are only accepted for
 * the push services browsers actually use. That keeps the worker from being pointed at arbitrary
 * hosts (server-side request forgery).
 */

export type PushKeys = { endpoint: string; p256dh: string; auth: string }
export type VapidConfig = { publicKey: string; privateKey: string; subject: string }

const PUSH_HOSTS: readonly RegExp[] = [
  /^fcm\.googleapis\.com$/, // Chrome, Edge, Opera, Samsung Internet
  /^updates\.push\.services\.mozilla\.com$/, // Firefox
  /^web\.push\.apple\.com$/, // Safari
  /^[a-z0-9-]+\.notify\.windows\.com$/, // Edge on Windows (WNS)
]

export function isAllowedPushEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint)
    return url.protocol === 'https:' && url.port === '' && !url.username && !url.password && PUSH_HOSTS.some((h) => h.test(url.hostname)) && endpoint.length <= 1024
  } catch {
    return false
  }
}

const b64u = (buf: Buffer) => buf.toString('base64url')
const fromB64u = (s: string) => Buffer.from(s, 'base64url')

/** HKDF (RFC 5869) for outputs of at most one SHA-256 block. */
function hkdf(salt: Buffer, ikm: Buffer, info: Buffer, length: number): Buffer {
  const prk = createHmac('sha256', salt).update(ikm).digest()
  return createHmac('sha256', prk).update(Buffer.concat([info, Buffer.from([1])])).digest().subarray(0, length)
}

export const RECORD_SIZE = 4096
/** Leaves room for the header, padding delimiter and tag inside one record. */
export const MAX_PAYLOAD_BYTES = 3000

/**
 * Encrypts one record for the subscription's keys. `asKeys` and `salt` are injectable only so the
 * tests can be deterministic; production always uses fresh random values.
 */
export function encryptPayload(plaintext: Buffer, keys: Pick<PushKeys, 'p256dh' | 'auth'>, options: { asPrivateKey?: Buffer; salt?: Buffer } = {}): Buffer {
  if (plaintext.length > MAX_PAYLOAD_BYTES) throw new Error('push payload too large')
  const uaPublic = fromB64u(keys.p256dh)
  const authSecret = fromB64u(keys.auth)
  if (uaPublic.length !== 65 || uaPublic[0] !== 4) throw new Error('invalid p256dh key')
  if (authSecret.length !== 16) throw new Error('invalid auth secret')

  const as = createECDH('prime256v1')
  if (options.asPrivateKey) as.setPrivateKey(options.asPrivateKey)
  else as.generateKeys()
  const asPublic = as.getPublicKey()
  const ecdhSecret = as.computeSecret(uaPublic)

  // RFC 8291 section 3.4: combine the ECDH secret with the auth secret.
  const ikm = hkdf(authSecret, ecdhSecret, Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic]), 32)
  const salt = options.salt ?? randomBytes(16)
  const cek = hkdf(salt, ikm, Buffer.from('Content-Encoding: aes128gcm\0'), 16)
  const nonce = hkdf(salt, ikm, Buffer.from('Content-Encoding: nonce\0'), 12)

  const cipher = createCipheriv('aes-128-gcm', cek, nonce)
  // A single, final record: plaintext then the 0x02 delimiter, no extra padding.
  const body = Buffer.concat([cipher.update(Buffer.concat([plaintext, Buffer.from([2])])), cipher.final(), cipher.getAuthTag()])
  const header = Buffer.alloc(21)
  salt.copy(header, 0)
  header.writeUInt32BE(RECORD_SIZE, 16)
  header.writeUInt8(asPublic.length, 20)
  return Buffer.concat([header, asPublic, body])
}

/** VAPID Authorization header value: an ES256 JWT for the push service's origin plus our public key. */
export function vapidAuthorization(endpoint: string, vapid: VapidConfig, now: Date = new Date()): string {
  const publicKey = fromB64u(vapid.publicKey)
  if (publicKey.length !== 65 || publicKey[0] !== 4) throw new Error('invalid VAPID public key')
  const header = b64u(Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const claims = b64u(Buffer.from(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(now.getTime() / 1000) + 12 * 3600, sub: vapid.subject })))
  const key = createPrivateKey({
    format: 'jwk',
    key: { kty: 'EC', crv: 'P-256', d: vapid.privateKey, x: b64u(publicKey.subarray(1, 33)), y: b64u(publicKey.subarray(33, 65)) },
  })
  const signature = sign('sha256', Buffer.from(`${header}.${claims}`), { key, dsaEncoding: 'ieee-p1363' })
  return `vapid t=${header}.${claims}.${b64u(signature)}, k=${vapid.publicKey}`
}

/** For setup: `npx tsx -e "import('./src/lib/push/webpush.ts').then(m => console.log(m.generateVapidKeys()))"`. */
export function generateVapidKeys(): { publicKey: string; privateKey: string } {
  const ecdh = createECDH('prime256v1')
  ecdh.generateKeys()
  const d = ecdh.getPrivateKey()
  // A scalar with leading zero bytes comes back shorter; JWK needs exactly 32 bytes.
  return { publicKey: b64u(ecdh.getPublicKey()), privateKey: b64u(Buffer.concat([Buffer.alloc(32 - d.length), d])) }
}

export type PushResult = { ok: true } | { ok: false; gone: boolean; status: number }

/** Sends one notification. 404 and 410 mean the subscription is gone and should be deleted. */
export async function sendWebPush(subscription: PushKeys, payload: unknown, vapid: VapidConfig, options: { ttlSeconds?: number } = {}): Promise<PushResult> {
  if (!isAllowedPushEndpoint(subscription.endpoint)) return { ok: false, gone: true, status: 0 }
  const body = encryptPayload(Buffer.from(JSON.stringify(payload)), subscription)
  const response = await fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      Authorization: vapidAuthorization(subscription.endpoint, vapid),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(options.ttlSeconds ?? 24 * 3600),
      Urgency: 'normal',
    },
    body: new Uint8Array(body),
    redirect: 'error',
    signal: AbortSignal.timeout(10_000),
  })
  if (response.ok) return { ok: true }
  return { ok: false, gone: response.status === 404 || response.status === 410, status: response.status }
}
