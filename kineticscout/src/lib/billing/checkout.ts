import 'server-only'
import { audit } from '@/lib/audit'
import { canPurchase, type SessionUser } from '@/lib/auth/permissions'
import { PRO_PRICES, type BillingPeriod } from '@/lib/billing/plans'
import { LIVE_STATUSES } from '@/lib/billing/status'
import { priceIdFor, stripe } from '@/lib/billing/stripe'
import { db } from '@/lib/db'
import { env } from '@/lib/env'
import { logger } from '@/lib/logger'

export type CheckoutOutcome =
  | { kind: 'redirect'; url: string }
  | { kind: 'already-subscribed' }
  | { kind: 'consent-required' }
  | { kind: 'unavailable' }

const STRIPE_LIVE_STATUSES = new Set(['incomplete', 'trialing', 'active', 'past_due'])
const CHECKOUT_TTL_SECONDS = 30 * 60
const priceVerifiedAt = new Map<string, number>()

/**
 * Refuses checkout if the Stripe Price no longer matches the amount on the pricing page.
 * This is the "no hidden fees" guarantee: the displayed number is the charged number.
 */
async function assertPriceMatchesDisplay(period: BillingPeriod, priceId: string): Promise<boolean> {
  const cachedAt = priceVerifiedAt.get(priceId)
  if (cachedAt && Date.now() - cachedAt < 10 * 60_000) return true
  const price = await stripe().prices.retrieve(priceId)
  const expected = PRO_PRICES[period]
  const ok =
    price.active &&
    price.unit_amount === expected.amountCents &&
    price.currency === expected.currency &&
    price.recurring?.interval === expected.interval
  if (!ok) {
    logger.error({ priceId, period }, 'Stripe price does not match the displayed price; checkout disabled')
    return false
  }
  priceVerifiedAt.set(priceId, Date.now())
  return true
}

/** Returns the user's Stripe customer id, creating the customer exactly once. */
export async function ensureStripeCustomer(user: SessionUser): Promise<string> {
  const existing = await db.user.findUnique({ where: { id: user.id }, select: { stripeCustomerId: true } })
  if (existing?.stripeCustomerId) return existing.stripeCustomerId

  const customer = await stripe().customers.create(
    { email: user.email, metadata: { userId: user.id } },
    // Same key for the same user: concurrent first checkouts resolve to one customer.
    { idempotencyKey: `customer-create-${user.id}` },
  )
  const claimed = await db.user.updateMany({
    where: { id: user.id, stripeCustomerId: null },
    data: { stripeCustomerId: customer.id },
  })
  if (claimed.count === 1) return customer.id
  const row = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { stripeCustomerId: true } })
  return row.stripeCustomerId ?? customer.id
}

/**
 * Starts (or resumes) a Stripe Checkout for Pro. Layers of duplicate protection:
 *   1. a live subscription in our mirror or in Stripe sends the user to the billing portal,
 *   2. a per-user advisory lock serialises concurrent clicks,
 *   3. an unexpired open session for the same price is reused instead of creating another,
 *   4. the Stripe idempotency key collapses retries inside a 10-minute window,
 *   5. the webhook cancels and refunds any duplicate that still gets through, and
 *   6. a partial unique index makes a second live subscription row impossible.
 */
export async function startProCheckout(user: SessionUser, period: BillingPeriod): Promise<CheckoutOutcome> {
  if (!canPurchase(user)) return { kind: 'consent-required' }
  if (user.tier === 'PRO') return { kind: 'already-subscribed' }

  const priceId = priceIdFor(period)
  if (!(await assertPriceMatchesDisplay(period, priceId))) return { kind: 'unavailable' }

  const customerId = await ensureStripeCustomer(user)

  return db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`billing:${user.id}`}, 0))`

      const liveRow = await tx.subscription.findFirst({
        where: { userId: user.id, status: { in: [...LIVE_STATUSES] } },
        select: { id: true },
      })
      if (liveRow) return { kind: 'already-subscribed' } as const

      // Webhooks can lag a few seconds behind a payment; ask Stripe directly as well.
      const remote = await stripe().subscriptions.list({ customer: customerId, status: 'all', limit: 20 })
      if (remote.data.some((s) => STRIPE_LIVE_STATUSES.has(s.status))) return { kind: 'already-subscribed' } as const

      const reusable = await tx.checkoutSession.findFirst({
        where: { userId: user.id, priceId, status: 'OPEN', expiresAt: { gt: new Date(Date.now() + 2 * 60_000) } },
        orderBy: { createdAt: 'desc' },
        select: { url: true },
      })
      if (reusable) return { kind: 'redirect', url: reusable.url } as const

      const appUrl = env().APP_URL
      const windowBucket = Math.floor(Date.now() / (10 * 60_000))
      const session = await stripe().checkout.sessions.create(
        {
          mode: 'subscription',
          customer: customerId,
          client_reference_id: user.id,
          line_items: [{ price: priceId, quantity: 1 }],
          success_url: `${appUrl}/dashboard/billing?checkout=success`,
          cancel_url: `${appUrl}/pricing?checkout=canceled`,
          expires_at: Math.floor(Date.now() / 1000) + CHECKOUT_TTL_SECONDS,
          billing_address_collection: 'auto',
          ...(env().STRIPE_AUTOMATIC_TAX ? { automatic_tax: { enabled: true }, customer_update: { address: 'auto' as const } } : {}),
          metadata: { userId: user.id },
          subscription_data: { metadata: { userId: user.id } },
        },
        { idempotencyKey: `checkout-${user.id}-${priceId}-${windowBucket}` },
      )
      if (!session.url) throw new Error('Stripe returned a checkout session without a URL')

      await tx.checkoutSession.upsert({
        where: { id: session.id },
        create: {
          id: session.id,
          userId: user.id,
          priceId,
          url: session.url,
          status: 'OPEN',
          expiresAt: new Date(session.expires_at * 1000),
        },
        update: {},
      })
      await audit('billing.checkout_started', { actorId: user.id, targetType: 'checkout_session', targetId: session.id, metadata: { period } })
      return { kind: 'redirect', url: session.url } as const
    },
    { timeout: 30_000, maxWait: 10_000 },
  )
}

export async function createBillingPortalUrl(user: SessionUser): Promise<string | null> {
  const row = await db.user.findUnique({ where: { id: user.id }, select: { stripeCustomerId: true } })
  if (!row?.stripeCustomerId) return null
  const session = await stripe().billingPortal.sessions.create({
    customer: row.stripeCustomerId,
    return_url: `${env().APP_URL}/dashboard/billing`,
  })
  return session.url
}
