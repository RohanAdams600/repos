import type { Metadata } from 'next'
import Link from 'next/link'
import { ProCheckoutForms } from '@/components/billing/plan-forms'
import { Alert } from '@/components/ui/alert'
import { buttonVariants } from '@/components/ui/button'
import { getAuthIdentity } from '@/lib/auth/session'
import { formatUsd, FREE_FEATURES, PRO_FEATURES, PRO_PRICES, yearlySavingsDollars } from '@/lib/billing/plans'

export const metadata: Metadata = {
  title: 'Pricing',
  description: `Scout is free forever. Pro Prospect is ${PRO_PRICES.monthly.label} or ${PRO_PRICES.yearly.label} with video analysis, college matching and unlimited logging.`,
  alternates: { canonical: '/pricing' },
}

const ERRORS: Record<string, string> = {
  'rate-limited': 'Too many checkout attempts. Wait a few minutes and try again.',
  unavailable: 'Checkout is temporarily unavailable. No payment was taken. Try again later.',
  'checkout-failed': 'We could not start checkout. No payment was taken. Try again in a moment.',
  'invalid-plan': 'Choose a monthly or yearly plan.',
}

const FEATURE_PAGES: Record<string, string> = {
  'video-analysis': 'Video analysis is part of Pro.',
  matchmaker: 'The College Matchmaker is part of Pro.',
}

export default async function PricingPage({ searchParams }: PageProps<'/pricing'>) {
  const params = await searchParams
  const identity = await getAuthIdentity().catch(() => null)
  const error = typeof params.error === 'string' ? ERRORS[params.error] : undefined
  const featureNote = typeof params.feature === 'string' ? FEATURE_PAGES[params.feature] : undefined

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-3">
        <h1 className="text-4xl font-bold">Pricing</h1>
        <p className="max-w-2xl text-lg text-fg-muted">Start free. Upgrade when you want deeper analysis. The price you see is the price you pay, and you can cancel any time in one step.</p>
      </div>
      {featureNote && <Alert tone="info">{featureNote}</Alert>}
      {error && <Alert tone="error">{error}</Alert>}
      {params.checkout === 'canceled' && <Alert tone="info">Checkout canceled. You have not been charged.</Alert>}

      <div className="grid gap-6 md:grid-cols-2">
        <section aria-labelledby="scout-title" className="flex flex-col gap-4 border-2 border-border-subtle p-6">
          <h2 id="scout-title" className="text-2xl font-bold">Scout</h2>
          <p><span className="text-4xl font-bold">$0</span> <span className="text-fg-muted">free forever</span></p>
          <ul className="flex list-disc flex-col gap-2 pl-5 text-fg-muted">
            {FREE_FEATURES.map((f) => <li key={f}>{f}</li>)}
          </ul>
          {!identity && (
            <Link href="/sign-up" className={buttonVariants({ variant: 'secondary' })}>Create free profile</Link>
          )}
        </section>
        <section aria-labelledby="pro-title" className="flex flex-col gap-4 border-2 border-fg p-6">
          <h2 id="pro-title" className="text-2xl font-bold">Pro Prospect</h2>
          <p>
            <span className="text-4xl font-bold">{formatUsd(PRO_PRICES.monthly.amountCents)}</span> <span className="text-fg-muted">per month, or {PRO_PRICES.yearly.label} (save ${yearlySavingsDollars()})</span>
          </p>
          <ul className="flex list-disc flex-col gap-2 pl-5 text-fg-muted">
            {PRO_FEATURES.map((f) => <li key={f}>{f}</li>)}
          </ul>
          {identity ? (
            <ProCheckoutForms />
          ) : (
            <Link href="/sign-up" className={buttonVariants({ variant: 'primary' })}>Create a profile to upgrade</Link>
          )}
          <p className="text-sm text-fg-muted">
            Prices are in US dollars. If sales tax applies where you live, it is shown at checkout before you pay. Athletes under 18 need a parent or guardian to approve and complete the purchase.{' '}
            <Link href="/legal/refunds">Refund Policy</Link>
          </p>
        </section>
      </div>
    </div>
  )
}
