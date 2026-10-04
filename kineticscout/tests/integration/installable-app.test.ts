import { createECDH, randomBytes } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionUser } from '@/lib/auth/permissions'
import { db } from '@/lib/db'
import { env, resetEnvCache } from '@/lib/env'
import { logMetric } from '@/lib/metrics/service'
import { notify } from '@/lib/notifications/service'
import { deliverPush, pushPayload, savePushSubscription } from '@/lib/push/service'
import { generateVapidKeys, type PushResult } from '@/lib/push/webpush'
import { createAthlete, resetDb } from '../helpers/db'

let sessionUser: SessionUser | null = null
vi.mock('@/lib/auth/session', () => ({ getSessionUser: async () => sessionUser }))
const { POST, DELETE } = await import('@/app/api/push/subscription/route')

const vapid = generateVapidKeys()

beforeEach(async () => {
  await resetDb()
  sessionUser = null
  process.env.VAPID_PUBLIC_KEY = vapid.publicKey
  process.env.VAPID_PRIVATE_KEY = vapid.privateKey
  process.env.VAPID_SUBJECT = 'mailto:support@example.test'
  resetEnvCache()
})

afterEach(() => {
  delete process.env.VAPID_PUBLIC_KEY
  delete process.env.VAPID_PRIVATE_KEY
  delete process.env.VAPID_SUBJECT
  resetEnvCache()
})

function browserKeys() {
  const ecdh = createECDH('prime256v1')
  ecdh.generateKeys()
  return { p256dh: ecdh.getPublicKey().toString('base64url'), auth: randomBytes(16).toString('base64url') }
}

const call = (method: 'POST' | 'DELETE', body: unknown, origin = env().APP_URL) =>
  (method === 'POST' ? POST : DELETE)(new Request(`${env().APP_URL}/api/push/subscription`, { method, body: JSON.stringify(body), headers: { origin, 'content-type': 'application/json' } }))

describe('push subscriptions', () => {
  it('saves a browser push service subscription for the signed-in user only', async () => {
    const keys = browserKeys()
    const endpoint = 'https://fcm.googleapis.com/fcm/send/device-one'
    expect((await call('POST', { endpoint, keys })).status).toBe(401)
    sessionUser = await createAthlete()
    expect((await call('POST', { endpoint, keys }, 'https://evil.example')).status).toBe(403)
    expect((await call('POST', { endpoint: 'https://internal.example/hook', keys })).status).toBe(400)
    expect((await call('POST', { endpoint, keys: { p256dh: 'short', auth: keys.auth } })).status).toBe(400)
    expect((await call('POST', { endpoint, keys })).status).toBe(201)
    expect(await db.pushSubscription.count({ where: { userId: sessionUser.id } })).toBe(1)

    // The same browser signed in as someone else: the endpoint moves to them.
    const other = await createAthlete()
    sessionUser = other
    expect((await call('POST', { endpoint, keys })).status).toBe(201)
    expect(await db.pushSubscription.findUniqueOrThrow({ where: { endpoint } })).toMatchObject({ userId: other.id })

    expect((await call('DELETE', { endpoint })).status).toBe(200)
    expect(await db.pushSubscription.count()).toBe(0)
  })

  it('is unavailable when push is not configured', async () => {
    delete process.env.VAPID_PUBLIC_KEY
    delete process.env.VAPID_PRIVATE_KEY
    delete process.env.VAPID_SUBJECT
    resetEnvCache()
    sessionUser = await createAthlete()
    expect((await call('POST', { endpoint: 'https://fcm.googleapis.com/fcm/send/x', keys: browserKeys() })).status).toBe(404)
  })

  it('keeps the ten most recent devices per account', async () => {
    const user = await createAthlete()
    for (let i = 0; i < 12; i++) await savePushSubscription(user.id, { endpoint: `https://fcm.googleapis.com/fcm/send/d${i}`, ...browserKeys() })
    expect(await db.pushSubscription.count({ where: { userId: user.id } })).toBe(10)
  })
})

describe('push delivery', () => {
  it('sends a generic line to every device, removes dead subscriptions and skips read notifications', async () => {
    const user = await createAthlete()
    for (const name of ['live', 'gone', 'flaky']) await savePushSubscription(user.id, { endpoint: `https://fcm.googleapis.com/fcm/send/${name}`, ...browserKeys() })
    await notify({ userId: user.id, kind: 'MESSAGE', title: 'New message from Coach Jordan Lee', body: 'Private message text', href: '/dashboard/messages/abc' })
    const notification = await db.notification.findFirstOrThrow({ where: { userId: user.id } })

    const payloads: unknown[] = []
    const send = vi.fn(async (sub: { endpoint: string }, payload: unknown): Promise<PushResult> => {
      payloads.push(payload)
      if (sub.endpoint.endsWith('/gone')) return { ok: false, gone: true, status: 410 }
      if (sub.endpoint.endsWith('/flaky')) return { ok: false, gone: false, status: 503 }
      return { ok: true }
    })
    expect(await deliverPush(notification.id, send)).toEqual({ sent: 1, removed: 1 })
    // Nothing identifying reaches the lock screen.
    expect(payloads[0]).toEqual({ title: 'New message', body: 'Open KineticScout to read it.', url: '/dashboard/messages/abc', tag: 'MESSAGE' })
    expect(JSON.stringify(payloads)).not.toContain('Jordan')
    expect(await db.pushSubscription.count({ where: { userId: user.id } })).toBe(2)
    expect((await db.pushSubscription.findFirstOrThrow({ where: { endpoint: { endsWith: '/flaky' } } })).failureCount).toBe(1)

    await db.notification.update({ where: { id: notification.id }, data: { readAt: new Date() } })
    expect(await deliverPush(notification.id, send)).toEqual({ sent: 0, removed: 0 })
    expect(pushPayload('CONTACT_REQUEST', '//evil.example').url).toBe('/dashboard/notifications')
  })
})

describe('offline logging', () => {
  it('logs a measurement once however many times the device resends it', async () => {
    const athlete = await createAthlete()
    const clientRef = crypto.randomUUID()
    const input = { metricType: 'EXIT_VELOCITY' as const, value: 88, date: new Date(), clientRef }
    const first = await logMetric(athlete, input)
    const again = await logMetric(athlete, input)
    expect(again.id).toBe(first.id)
    expect(again.remaining).toBe(first.remaining)
    expect(await db.metric.count({ where: { athleteId: athlete.id } })).toBe(1)
    // Concurrent resends collapse too.
    const ref2 = crypto.randomUUID()
    const results = await Promise.all([1, 2, 3].map(() => logMetric(athlete, { ...input, clientRef: ref2, value: 90 })))
    expect(new Set(results.map((r) => r.id)).size).toBe(1)
    expect(await db.metric.count({ where: { athleteId: athlete.id } })).toBe(2)
  })
})
