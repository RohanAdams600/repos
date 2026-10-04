import 'server-only'
import type Stripe from 'stripe'
import { Prisma } from '@/generated/prisma/client'
import { syncStripeSubscription, UnknownCustomerError } from '@/lib/billing/sync'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'

/** Events this endpoint subscribes to in the Stripe dashboard. Anything else is acknowledged and ignored. */
export const HANDLED_EVENT_TYPES = [
  'checkout.session.completed',
  'checkout.session.expired',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'customer.subscription.paused',
  'customer.subscription.resumed',
  'invoice.paid',
  'invoice.payment_failed',
] as const

function idOf(value: string | { id: string } | null | undefined): string | null {
  if (!value) return null
  return typeof value === 'string' ? value : value.id
}

async function dispatch(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object
      await db.checkoutSession.updateMany({ where: { id: session.id }, data: { status: 'COMPLETE' } })
      const subscriptionId = idOf(session.subscription)
      const customerId = idOf(session.customer)
      if (session.mode === 'subscription' && subscriptionId && customerId) {
        await syncStripeSubscription(subscriptionId, customerId)
      }
      return
    }
    case 'checkout.session.expired': {
      await db.checkoutSession.updateMany({ where: { id: event.data.object.id }, data: { status: 'EXPIRED' } })
      return
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
    case 'customer.subscription.paused':
    case 'customer.subscription.resumed': {
      const subscription = event.data.object
      const customerId = idOf(subscription.customer)
      if (customerId) await syncStripeSubscription(subscription.id, customerId)
      return
    }
    case 'invoice.paid':
    case 'invoice.payment_failed': {
      const invoice = event.data.object
      const subscriptionId = idOf(invoice.parent?.subscription_details?.subscription)
      const customerId = idOf(invoice.customer)
      if (subscriptionId && customerId) await syncStripeSubscription(subscriptionId, customerId)
      return
    }
    default:
      return
  }
}

export type WebhookOutcome = 'processed' | 'duplicate' | 'ignored'

/**
 * Processes a verified Stripe event at most once.
 *
 * Handlers are idempotent (they re-read Stripe), so a crash between handling and recording is
 * safe: Stripe redelivers, the handler converges to the same state, and the ledger row is written.
 * The ledger is written only after success, so failures are retried by Stripe.
 */
export async function processStripeEvent(event: Stripe.Event): Promise<WebhookOutcome> {
  if (!(HANDLED_EVENT_TYPES as readonly string[]).includes(event.type)) return 'ignored'

  const seen = await db.stripeEvent.findUnique({ where: { id: event.id }, select: { id: true } })
  if (seen) return 'duplicate'

  try {
    await dispatch(event)
  } catch (error) {
    if (error instanceof UnknownCustomerError) {
      // A customer created outside this app (e.g. in the dashboard). Acknowledge so Stripe stops
      // retrying; log for investigation.
      logger.warn({ eventId: event.id, type: event.type }, error.message)
    } else {
      throw error
    }
  }

  try {
    await db.stripeEvent.create({ data: { id: event.id, type: event.type } })
  } catch (error) {
    // A concurrent delivery of the same event finished first. Both converged to the same state.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return 'duplicate'
    throw error
  }
  return 'processed'
}
