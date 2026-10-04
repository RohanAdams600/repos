import type { SubscriptionStatus } from '@/generated/prisma/enums'

/** Statuses that grant Pro access. past_due keeps access during Stripe's automatic retry window. */
export const PRO_GRANTING_STATUSES: readonly SubscriptionStatus[] = ['ACTIVE', 'TRIALING', 'PAST_DUE']

/** Statuses counted as "live" for duplicate prevention (matches the partial unique index). */
export const LIVE_STATUSES: readonly SubscriptionStatus[] = ['INCOMPLETE', 'TRIALING', 'ACTIVE', 'PAST_DUE']

const STRIPE_TO_DB: Record<string, SubscriptionStatus> = {
  incomplete: 'INCOMPLETE',
  incomplete_expired: 'INCOMPLETE_EXPIRED',
  trialing: 'TRIALING',
  active: 'ACTIVE',
  past_due: 'PAST_DUE',
  canceled: 'CANCELED',
  unpaid: 'UNPAID',
  paused: 'PAUSED',
}

export function mapStripeStatus(status: string): SubscriptionStatus {
  const mapped = STRIPE_TO_DB[status]
  // An unknown future status must never grant access.
  return mapped ?? 'UNPAID'
}

export function isLiveStatus(status: SubscriptionStatus): boolean {
  return LIVE_STATUSES.includes(status)
}

export function tierFor(subscriptions: readonly { status: SubscriptionStatus; isProPrice: boolean }[]): 'PRO' | 'FREE' {
  return subscriptions.some((s) => s.isProPrice && PRO_GRANTING_STATUSES.includes(s.status)) ? 'PRO' : 'FREE'
}
