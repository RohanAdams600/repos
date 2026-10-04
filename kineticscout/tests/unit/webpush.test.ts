import { createDecipheriv, createECDH, createHmac, createPublicKey, randomBytes, verify } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { encryptPayload, generateVapidKeys, isAllowedPushEndpoint, MAX_PAYLOAD_BYTES, RECORD_SIZE, vapidAuthorization } from '@/lib/push/webpush'

function hkdf(salt: Buffer, ikm: Buffer, info: Buffer, length: number): Buffer {
  const prk = createHmac('sha256', salt).update(ikm).digest()
  return createHmac('sha256', prk).update(Buffer.concat([info, Buffer.from([1])])).digest().subarray(0, length)
}

/** What a browser does on receipt (RFC 8291 and RFC 8188), written independently of the sender. */
function decryptAsBrowser(body: Buffer, ua: ReturnType<typeof createECDH>, authSecret: Buffer): Buffer {
  const salt = body.subarray(0, 16)
  const rs = body.readUInt32BE(16)
  const idlen = body.readUInt8(20)
  const asPublic = body.subarray(21, 21 + idlen)
  const ciphertext = body.subarray(21 + idlen)
  expect(rs).toBe(RECORD_SIZE)
  const ecdhSecret = ua.computeSecret(asPublic)
  const ikm = hkdf(authSecret, ecdhSecret, Buffer.concat([Buffer.from('WebPush: info\0'), ua.getPublicKey(), asPublic]), 32)
  const cek = hkdf(salt, ikm, Buffer.from('Content-Encoding: aes128gcm\0'), 16)
  const nonce = hkdf(salt, ikm, Buffer.from('Content-Encoding: nonce\0'), 12)
  const decipher = createDecipheriv('aes-128-gcm', cek, nonce)
  decipher.setAuthTag(ciphertext.subarray(ciphertext.length - 16))
  const padded = Buffer.concat([decipher.update(ciphertext.subarray(0, ciphertext.length - 16)), decipher.final()])
  // Strip padding: the last non-zero byte is the delimiter, 0x02 for the final record.
  let end = padded.length - 1
  while (end >= 0 && padded[end] === 0) end--
  expect(padded[end]).toBe(2)
  return padded.subarray(0, end)
}

function subscriber() {
  const ua = createECDH('prime256v1')
  ua.generateKeys()
  const auth = randomBytes(16)
  return { ua, auth, keys: { p256dh: ua.getPublicKey().toString('base64url'), auth: auth.toString('base64url') } }
}

describe('web push payload encryption', () => {
  it('produces a record the browser can decrypt', () => {
    const { ua, auth, keys } = subscriber()
    const payload = Buffer.from(JSON.stringify({ title: 'New message', url: '/dashboard/messages' }))
    const body = encryptPayload(payload, keys)
    expect(decryptAsBrowser(body, ua, auth).toString()).toBe(payload.toString())
  })

  it('uses fresh keys and salt every time, and rejects bad inputs', () => {
    const { keys } = subscriber()
    const a = encryptPayload(Buffer.from('same'), keys)
    const b = encryptPayload(Buffer.from('same'), keys)
    expect(a.equals(b)).toBe(false)
    expect(() => encryptPayload(Buffer.alloc(MAX_PAYLOAD_BYTES + 1), keys)).toThrow(/too large/)
    expect(() => encryptPayload(Buffer.from('x'), { ...keys, auth: 'short' })).toThrow(/auth/)
    expect(() => encryptPayload(Buffer.from('x'), { ...keys, p256dh: Buffer.alloc(65).toString('base64url') })).toThrow()
  })
})

describe('VAPID', () => {
  it('signs a JWT for the push service origin that verifies with the public key', () => {
    const vapid = { ...generateVapidKeys(), subject: 'mailto:support@example.test' }
    const header = vapidAuthorization('https://fcm.googleapis.com/fcm/send/abc', vapid, new Date('2026-10-05T00:00:00Z'))
    const match = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(header)
    expect(match).not.toBeNull()
    const [, h, c, s, k] = match!
    expect(k).toBe(vapid.publicKey)
    const claims = JSON.parse(Buffer.from(c!, 'base64url').toString())
    expect(claims).toEqual({ aud: 'https://fcm.googleapis.com', exp: Math.floor(Date.parse('2026-10-05T00:00:00Z') / 1000) + 43200, sub: 'mailto:support@example.test' })
    const pub = Buffer.from(vapid.publicKey, 'base64url')
    const key = createPublicKey({ format: 'jwk', key: { kty: 'EC', crv: 'P-256', x: pub.subarray(1, 33).toString('base64url'), y: pub.subarray(33).toString('base64url') } })
    expect(verify('sha256', Buffer.from(`${h}.${c}`), { key, dsaEncoding: 'ieee-p1363' }, Buffer.from(s!, 'base64url'))).toBe(true)
  })
})

describe('push endpoint allowlist', () => {
  it('accepts browser push services only', () => {
    expect(isAllowedPushEndpoint('https://fcm.googleapis.com/fcm/send/abc:def')).toBe(true)
    expect(isAllowedPushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/abc')).toBe(true)
    expect(isAllowedPushEndpoint('https://web.push.apple.com/QGx')).toBe(true)
    expect(isAllowedPushEndpoint('https://wns2-par02p.notify.windows.com/w/?token=abc')).toBe(true)
    expect(isAllowedPushEndpoint('http://fcm.googleapis.com/fcm/send/abc')).toBe(false)
    expect(isAllowedPushEndpoint('https://fcm.googleapis.com:8443/x')).toBe(false)
    expect(isAllowedPushEndpoint('https://fcm.googleapis.com.evil.example/x')).toBe(false)
    expect(isAllowedPushEndpoint('https://169.254.169.254/latest/meta-data')).toBe(false)
    expect(isAllowedPushEndpoint('https://user:pw@fcm.googleapis.com/x')).toBe(false)
    expect(isAllowedPushEndpoint('not a url')).toBe(false)
  })
})
