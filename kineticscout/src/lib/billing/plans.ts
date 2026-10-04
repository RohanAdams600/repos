/**
 * Plan catalogue. The displayed prices here are checked against the live Stripe Price before
 * every checkout (see assertPriceMatchesDisplay), so a customer is never charged an amount
 * different from the one shown on the pricing page.
 */

export type BillingPeriod = 'monthly' | 'yearly'

export const PRO_PRICES: Record<BillingPeriod, { amountCents: number; currency: 'usd'; interval: 'month' | 'year'; label: string }> = {
  monthly: { amountCents: 1499, currency: 'usd', interval: 'month', label: '$14.99 per month' },
  yearly: { amountCents: 12900, currency: 'usd', interval: 'year', label: '$129 per year' },
}

export const FREE_FEATURES = [
  'Public profile you control',
  'Log up to 3 metrics per month',
  'Percentile ranking against your graduating class',
] as const

export const PRO_FEATURES = [
  'Unlimited metric logging with progression charts',
  'AI biomechanics video analysis with skeletal overlay',
  'College Matchmaker against program recruiting averages',
  'AI-drafted outreach emails to college coaches',
] as const

/** Yearly savings versus twelve monthly payments, in whole dollars, for honest comparison copy. */
export function yearlySavingsDollars(): number {
  return Math.round((PRO_PRICES.monthly.amountCents * 12 - PRO_PRICES.yearly.amountCents) / 100)
}

export function formatUsd(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: cents % 100 === 0 ? 0 : 2 }).format(cents / 100)
}
