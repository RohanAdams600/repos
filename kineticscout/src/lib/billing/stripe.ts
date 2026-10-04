import 'server-only'
import Stripe from 'stripe'
import type { BillingPeriod } from '@/lib/billing/plans'
import { env, requireEnv } from '@/lib/env'

let client: Stripe | undefined

export function stripe(): Stripe {
  if (!client) {
    const { STRIPE_SECRET_KEY } = requireEnv('Stripe billing', ['STRIPE_SECRET_KEY'])
    client = new Stripe(STRIPE_SECRET_KEY, {
      // Retries reuse the same idempotency key, so a retried create never double-charges.
      maxNetworkRetries: 2,
      timeout: 10_000,
      appInfo: { name: 'KineticScout' },
    })
  }
  return client
}

export function priceIdFor(period: BillingPeriod): string {
  const e = requireEnv('Stripe prices', ['STRIPE_PRICE_PRO_MONTHLY', 'STRIPE_PRICE_PRO_YEARLY'])
  return period === 'monthly' ? e.STRIPE_PRICE_PRO_MONTHLY : e.STRIPE_PRICE_PRO_YEARLY
}

export function intervalForPrice(priceId: string): 'MONTH' | 'YEAR' | null {
  const e = env()
  if (priceId === e.STRIPE_PRICE_PRO_MONTHLY) return 'MONTH'
  if (priceId === e.STRIPE_PRICE_PRO_YEARLY) return 'YEAR'
  return null
}

export function isProPrice(priceId: string): boolean {
  return intervalForPrice(priceId) !== null
}

/** Test hook. */
export function setStripeClientForTests(instance: Stripe | undefined): void {
  client = instance
}
