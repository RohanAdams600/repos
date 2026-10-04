import type { Metadata } from 'next'
import Link from 'next/link'
import { ProCheckoutForms } from '@/components/billing/plan-forms'
import { Alert } from '@/components/ui/alert'
import { buttonVariants } from '@/components/ui/button'
import { pick } from '@/i18n/define'
import { pricingMessages } from '@/i18n/messages/pricing'
import { getLocale, messages } from '@/i18n/server'
import { getAuthIdentity } from '@/lib/auth/session'
import { formatUsd, planFeatures, priceLabel, PRO_PRICES, yearlySavingsDollars } from '@/lib/billing/plans'

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale()
  const m = pick(pricingMessages, locale)
  return { title: m.title, description: m.description(priceLabel('monthly', locale), priceLabel('yearly', locale)), alternates: { canonical: '/pricing' } }
}

export default async function PricingPage({ searchParams }: PageProps<'/pricing'>) {
  const params = await searchParams
  const locale = await getLocale()
  const m = await messages(pricingMessages)
  const features = planFeatures(locale)
  const identity = await getAuthIdentity().catch(() => null)
  const error = typeof params.error === 'string' ? m.errors[params.error] : undefined
  const featureNote = typeof params.feature === 'string' ? m.features[params.feature] : undefined

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-3">
        <h1 className="text-4xl font-bold">{m.title}</h1>
        <p className="max-w-2xl text-lg text-fg-muted">{m.lead}</p>
      </div>
      {featureNote && <Alert tone="info">{featureNote}</Alert>}
      {error && <Alert tone="error">{error}</Alert>}
      {params.checkout === 'canceled' && <Alert tone="info">{m.canceled}</Alert>}

      <div className="grid gap-6 md:grid-cols-2">
        <section aria-labelledby="scout-title" className="flex flex-col gap-4 border-2 border-border-subtle p-6">
          <h2 id="scout-title" className="text-2xl font-bold">Scout</h2>
          <p><span className="text-4xl font-bold">$0</span> <span className="text-fg-muted">{m.freeForever}</span></p>
          <ul className="flex list-disc flex-col gap-2 pl-5 text-fg-muted">
            {features.free.map((f) => <li key={f}>{f}</li>)}
          </ul>
          {!identity && (
            <Link href="/sign-up" className={buttonVariants({ variant: 'secondary' })}>{m.createProfile}</Link>
          )}
        </section>
        <section aria-labelledby="pro-title" className="flex flex-col gap-4 border-2 border-fg p-6">
          <h2 id="pro-title" className="text-2xl font-bold">Pro Prospect</h2>
          <p>
            <span className="text-4xl font-bold">{formatUsd(PRO_PRICES.monthly.amountCents)}</span>{' '}
            <span className="text-fg-muted">{m.perMonthOr(priceLabel('yearly', locale), yearlySavingsDollars())}</span>
          </p>
          <ul className="flex list-disc flex-col gap-2 pl-5 text-fg-muted">
            {features.pro.map((f) => <li key={f}>{f}</li>)}
          </ul>
          {identity ? (
            <ProCheckoutForms />
          ) : (
            <Link href="/sign-up" className={buttonVariants({ variant: 'primary' })}>{m.createToUpgrade}</Link>
          )}
          <p className="text-sm text-fg-muted">
            {m.taxNote} <Link href="/legal/refunds">{m.refundPolicy}</Link>
          </p>
        </section>
      </div>
    </div>
  )
}
