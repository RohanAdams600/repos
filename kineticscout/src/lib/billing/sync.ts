import 'server-only'
import type Stripe from 'stripe'
import { audit } from '@/lib/audit'
import { intervalForPrice, isProPrice, stripe } from '@/lib/billing/stripe'
import { isLiveStatus, mapStripeStatus, tierFor } from '@/lib/billing/status'
import { db } from '@/lib/db'
import { errorFields, logger } from '@/lib/logger'

export class UnknownCustomerError extends Error {
  constructor(customerId: string) {
    super(`No KineticScout user for Stripe customer ${customerId}`)
    this.name = 'UnknownCustomerError'
  }
}

function customerIdOf(value: string | { id: string } | null): string | null {
  if (!value) return null
  return typeof value === 'string' ? value : value.id
}

/**
 * Brings our mirror of one subscription in line with Stripe.
 *
 * Correctness under concurrent and out-of-order webhook deliveries:
 *   - The subscription is re-fetched from Stripe *after* taking a per-user advisory lock, so the
 *     last writer always writes the freshest state, regardless of event order.
 *   - The user's tier is recomputed from all of their subscription rows, never toggled.
 *   - If a second live subscription appears for a user who already has one (two checkout tabs
 *     paid), the newcomer is canceled in Stripe and its payment refunded, then recorded as canceled.
 */
export async function syncStripeSubscription(subscriptionId: string, customerId: string): Promise<'synced' | 'duplicate-canceled'> {
  const user = await db.user.findUnique({ where: { stripeCustomerId: customerId }, select: { id: true } })
  if (!user) throw new UnknownCustomerError(customerId)

  return db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`billing:${user.id}`}, 0))`

      const subscription = await stripe().subscriptions.retrieve(subscriptionId)
      if (customerIdOf(subscription.customer) !== customerId) {
        throw new Error('Subscription customer mismatch')
      }

      const item = subscription.items.data[0]
      const priceId = item?.price.id ?? ''
      let status = mapStripeStatus(subscription.status)
      let outcome: 'synced' | 'duplicate-canceled' = 'synced'

      if (isLiveStatus(status)) {
        const otherLive = await tx.subscription.findFirst({
          where: { userId: user.id, id: { not: subscription.id }, status: { in: ['INCOMPLETE', 'TRIALING', 'ACTIVE', 'PAST_DUE'] } },
          select: { id: true },
        })
        if (otherLive) {
          await cancelDuplicateSubscription(subscription)
          status = 'CANCELED'
          outcome = 'duplicate-canceled'
          await audit('billing.duplicate_subscription_canceled', {
            actorId: user.id,
            targetType: 'subscription',
            targetId: subscription.id,
            metadata: { keptSubscriptionId: otherLive.id },
          })
        }
      }

      const interval = intervalForPrice(priceId) ?? (item?.price.recurring?.interval === 'year' ? 'YEAR' : 'MONTH')
      const data = {
        status,
        priceId,
        interval,
        currentPeriodEnd: item?.current_period_end ? new Date(item.current_period_end * 1000) : null,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
      } as const
      await tx.subscription.upsert({
        where: { id: subscription.id },
        create: { id: subscription.id, userId: user.id, ...data },
        update: data,
      })

      const rows = await tx.subscription.findMany({ where: { userId: user.id }, select: { status: true, priceId: true } })
      const tier = tierFor(rows.map((r) => ({ status: r.status, isProPrice: isProPrice(r.priceId) })))
      await tx.user.update({ where: { id: user.id }, data: { subscriptionTier: tier } })

      await audit('billing.subscription_synced', {
        actorId: user.id,
        targetType: 'subscription',
        targetId: subscription.id,
        metadata: { status, tier },
      })
      return outcome
    },
    { timeout: 30_000, maxWait: 10_000 },
  )
}

async function cancelDuplicateSubscription(subscription: Stripe.Subscription): Promise<void> {
  const client = stripe()
  if (subscription.status !== 'canceled') {
    await client.subscriptions.cancel(subscription.id, { prorate: false }, { idempotencyKey: `dup-cancel-${subscription.id}` })
  }
  const invoiceId = typeof subscription.latest_invoice === 'string' ? subscription.latest_invoice : subscription.latest_invoice?.id
  if (!invoiceId) return
  try {
    const invoice = await client.invoices.retrieve(invoiceId, { expand: ['payments'] })
    for (const invoicePayment of invoice.payments?.data ?? []) {
      if (invoicePayment.status !== 'paid') continue
      const intent = invoicePayment.payment.payment_intent
      const paymentIntentId = typeof intent === 'string' ? intent : intent?.id
      if (!paymentIntentId) continue
      await client.refunds.create(
        { payment_intent: paymentIntentId, reason: 'duplicate', metadata: { subscription: subscription.id } },
        { idempotencyKey: `dup-refund-${paymentIntentId}` },
      )
    }
  } catch (error) {
    // The cancellation stands. Not rethrown: a webhook retry would see a canceled subscription
    // and skip this branch, so the failure is recorded for manual follow-up instead.
    logger.error({ subscriptionId: subscription.id, ...errorFields(error) }, 'duplicate subscription refund failed')
    await audit('billing.duplicate_refund_failed', { targetType: 'subscription', targetId: subscription.id })
  }
}
