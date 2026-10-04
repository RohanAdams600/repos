import Stripe from 'stripe'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { POST } from '@/app/api/webhooks/stripe/route'
import { setStripeClientForTests } from '@/lib/billing/stripe'
import { db } from '@/lib/db'
import { createAthlete, resetDb } from '../helpers/db'

const WEBHOOK_SECRET = 'whsec_integration_test_secret'

/** In-memory stand-in for the Stripe API: subscriptions keyed by id, plus records of cancels and refunds. */
function createFakeStripe() {
  const real = new Stripe('sk_test_integration_only')
  const subscriptions = new Map<string, Record<string, unknown>>()
  const calls = { retrieve: 0, cancel: [] as string[], refunds: [] as string[] }
  const fake = real as unknown as Record<string, unknown>
  fake.subscriptions = {
    retrieve: async (id: string) => {
      calls.retrieve++
      const sub = subscriptions.get(id)
      if (!sub) throw new Error(`no such subscription ${id}`)
      return structuredClone(sub)
    },
    cancel: async (id: string) => {
      calls.cancel.push(id)
      const sub = subscriptions.get(id)!
      sub.status = 'canceled'
      return structuredClone(sub)
    },
    list: async () => ({ data: [] }),
  }
  fake.invoices = {
    retrieve: async (id: string) => ({ id, payments: { data: [{ status: 'paid', payment: { type: 'payment_intent', payment_intent: `pi_for_${id}` } }] } }),
  }
  fake.refunds = {
    create: async (params: { payment_intent: string }) => {
      calls.refunds.push(params.payment_intent)
      return { id: `re_${params.payment_intent}` }
    },
  }
  return { client: real, subscriptions, calls }
}

function subscription(id: string, customer: string, status: string, priceId = 'price_test_monthly') {
  return {
    id,
    object: 'subscription',
    customer,
    status,
    cancel_at_period_end: false,
    latest_invoice: `in_${id}`,
    items: { data: [{ price: { id: priceId, recurring: { interval: 'month' } }, current_period_end: 1_800_000_000 }] },
  }
}

function signedRequest(event: Record<string, unknown>): Request {
  const payload = JSON.stringify(event)
  const header = Stripe.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET })
  return new Request('http://localhost/api/webhooks/stripe', { method: 'POST', body: payload, headers: { 'stripe-signature': header, 'content-type': 'application/json' } })
}

let eventCounter = 0
function event(type: string, object: Record<string, unknown>) {
  return { id: `evt_test_${++eventCounter}_${Date.now()}`, object: 'event', type, created: Math.floor(Date.now() / 1000), data: { object } }
}

let fake: ReturnType<typeof createFakeStripe>
beforeEach(async () => {
  await resetDb()
  fake = createFakeStripe()
  setStripeClientForTests(fake.client)
})
afterAll(() => setStripeClientForTests(undefined))

describe('Stripe webhook endpoint', () => {
  it('rejects missing and forged signatures', async () => {
    const missing = await POST(new Request('http://localhost/api/webhooks/stripe', { method: 'POST', body: '{}' }))
    expect(missing.status).toBe(400)
    const forged = await POST(new Request('http://localhost/api/webhooks/stripe', { method: 'POST', body: '{}', headers: { 'stripe-signature': 't=1,v1=deadbeef' } }))
    expect(forged.status).toBe(400)
  })

  it('upgrades on subscription creation and processes each event id once', async () => {
    const user = await createAthlete({ stripeCustomerId: 'cus_1' })
    fake.subscriptions.set('sub_1', subscription('sub_1', 'cus_1', 'active'))
    const created = event('customer.subscription.created', subscription('sub_1', 'cus_1', 'active'))

    expect((await POST(signedRequest(created))).status).toBe(200)
    expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).subscriptionTier).toBe('PRO')
    const row = await db.subscription.findUniqueOrThrow({ where: { id: 'sub_1' } })
    expect(row).toMatchObject({ status: 'ACTIVE', interval: 'MONTH', userId: user.id })

    const retrievesBefore = fake.calls.retrieve
    expect((await POST(signedRequest(created))).status).toBe(200)
    expect(fake.calls.retrieve).toBe(retrievesBefore)
    expect(await db.stripeEvent.count()).toBe(1)
  })

  it('downgrades when the subscription ends, using Stripe as the source of truth', async () => {
    const user = await createAthlete({ stripeCustomerId: 'cus_2' })
    fake.subscriptions.set('sub_2', subscription('sub_2', 'cus_2', 'active'))
    await POST(signedRequest(event('customer.subscription.created', subscription('sub_2', 'cus_2', 'active'))))

    // A stale "updated" event arrives after cancellation: the handler re-reads Stripe, so state stays correct.
    fake.subscriptions.set('sub_2', subscription('sub_2', 'cus_2', 'canceled'))
    await POST(signedRequest(event('customer.subscription.deleted', subscription('sub_2', 'cus_2', 'canceled'))))
    await POST(signedRequest(event('customer.subscription.updated', subscription('sub_2', 'cus_2', 'active'))))

    expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).subscriptionTier).toBe('FREE')
    expect((await db.subscription.findUniqueOrThrow({ where: { id: 'sub_2' } })).status).toBe('CANCELED')
  })

  it('cancels and refunds a duplicate subscription instead of double billing', async () => {
    const user = await createAthlete({ stripeCustomerId: 'cus_3' })
    fake.subscriptions.set('sub_a', subscription('sub_a', 'cus_3', 'active'))
    fake.subscriptions.set('sub_b', subscription('sub_b', 'cus_3', 'active'))
    await POST(signedRequest(event('customer.subscription.created', subscription('sub_a', 'cus_3', 'active'))))
    const response = await POST(signedRequest(event('customer.subscription.created', subscription('sub_b', 'cus_3', 'active'))))

    expect(response.status).toBe(200)
    expect(fake.calls.cancel).toEqual(['sub_b'])
    expect(fake.calls.refunds).toEqual(['pi_for_in_sub_b'])
    expect((await db.subscription.findUniqueOrThrow({ where: { id: 'sub_b' } })).status).toBe('CANCELED')
    expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).subscriptionTier).toBe('PRO')
    expect(await db.auditLog.count({ where: { action: 'billing.duplicate_subscription_canceled' } })).toBe(1)
  })

  it('converges under concurrent deliveries for the same customer', async () => {
    const user = await createAthlete({ stripeCustomerId: 'cus_4' })
    fake.subscriptions.set('sub_4', subscription('sub_4', 'cus_4', 'active'))
    const deliveries = [
      event('customer.subscription.created', subscription('sub_4', 'cus_4', 'active')),
      event('invoice.paid', { id: 'in_1', customer: 'cus_4', parent: { subscription_details: { subscription: 'sub_4' } } }),
      event('customer.subscription.updated', subscription('sub_4', 'cus_4', 'active')),
      event('checkout.session.completed', { id: 'cs_1', mode: 'subscription', customer: 'cus_4', subscription: 'sub_4' }),
    ]
    const responses = await Promise.all(deliveries.map((e) => POST(signedRequest(e))))
    expect(responses.map((r) => r.status)).toEqual([200, 200, 200, 200])
    expect(await db.subscription.count({ where: { userId: user.id } })).toBe(1)
    expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).subscriptionTier).toBe('PRO')
  })

  it('acknowledges events for customers created outside the app', async () => {
    fake.subscriptions.set('sub_x', subscription('sub_x', 'cus_unknown', 'active'))
    const response = await POST(signedRequest(event('customer.subscription.created', subscription('sub_x', 'cus_unknown', 'active'))))
    expect(response.status).toBe(200)
  })
})

describe('database billing invariants', () => {
  it('refuses a second live subscription row for one user', async () => {
    const user = await createAthlete()
    await db.subscription.create({ data: { id: 'sub_live_1', userId: user.id, status: 'ACTIVE', priceId: 'p', interval: 'MONTH' } })
    await expect(db.subscription.create({ data: { id: 'sub_live_2', userId: user.id, status: 'TRIALING', priceId: 'p', interval: 'MONTH' } })).rejects.toThrow()
    await db.subscription.create({ data: { id: 'sub_old', userId: user.id, status: 'CANCELED', priceId: 'p', interval: 'MONTH' } })
  })
})
