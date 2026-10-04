import type { Metadata } from 'next'
import Link from 'next/link'
import { JsonLd } from '@/components/json-ld'
import { FaqList } from '@/components/marketing/faq-list'
import { buttonVariants } from '@/components/ui/button'
import { FREE_FEATURES, PRO_FEATURES, PRO_PRICES } from '@/lib/billing/plans'
import { FAQS, faqJsonLd } from '@/lib/content/faq'
import { organizationJsonLd } from '@/lib/content/organization'
import { db } from '@/lib/db'

export const metadata: Metadata = {
  title: { absolute: 'KineticScout: performance data for high school athletes' },
  alternates: { canonical: '/' },
}

export default async function HomePage() {
  const org = organizationJsonLd()
  const reviews = await db.testimonial
    .findMany({ where: { status: 'PUBLISHED' }, orderBy: { publishedAt: 'desc' }, take: 3, select: { id: true, displayName: true, descriptor: true, quote: true } })
    .catch(() => [])
  return (
    <div className="flex flex-col gap-24">
      <JsonLd data={faqJsonLd()} />
      {org && <JsonLd data={org} />}
      <section aria-labelledby="hero-title" className="grid gap-8 pt-4 lg:grid-cols-[3fr_2fr] lg:items-end">
        <div className="flex flex-col gap-6">
          <h1 id="hero-title" className="text-4xl leading-tight font-bold tracking-tight sm:text-6xl">
            Know your numbers. Show them to the right coaches.
          </h1>
          <p className="max-w-2xl text-lg text-fg-muted sm:text-xl">
            Log exit velocity, pitch velocity and sprint times, see where you rank in your graduating class, and compare your
            measurables with the programs you want to play for.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/sign-up" className={buttonVariants({ variant: 'primary' })}>
              Create your free profile
            </Link>
            <Link href="/pricing" className={buttonVariants({ variant: 'secondary' })}>
              Compare plans
            </Link>
          </div>
        </div>
        <figure className="flex flex-col gap-3">
          <figcaption className="text-sm font-bold text-fg-muted">Baseball metrics you can track</figcaption>
          <dl className="grid grid-cols-2 gap-px border-2 border-border-subtle bg-border-subtle">
            {[
              ['Exit velocity', 'mph, higher is better'],
              ['Pitch velocity', 'mph, higher is better'],
              ['60-yard dash', 'seconds, lower is better'],
              ['Pop time', 'seconds, lower is better'],
            ].map(([label, unit]) => (
              <div key={label} className="bg-bg p-4">
                <dt className="font-bold">{label}</dt>
                <dd className="mt-1 text-sm text-fg-muted">{unit}</dd>
              </div>
            ))}
          </dl>
        </figure>
      </section>

      <section aria-labelledby="how-title" className="flex flex-col gap-8">
        <h2 id="how-title" className="text-3xl font-bold">
          How it works
        </h2>
        <ol className="grid gap-8 md:grid-cols-2">
          <li className="flex gap-4">
            <span className="tabular shrink-0 text-2xl text-accent-text" aria-hidden="true">01</span>
            <div>
              <h3 className="text-xl font-bold">Log your measurables</h3>
              <p className="mt-2 text-fg-muted">Enter results from practice, showcases or team testing, with the date each one was measured.</p>
            </div>
          </li>
          <li className="flex gap-4">
            <span className="tabular shrink-0 text-2xl text-accent-text" aria-hidden="true">02</span>
            <div>
              <h3 className="text-xl font-bold">See where you stand</h3>
              <p className="mt-2 text-fg-muted">Your percentile within your graduating class on KineticScout, updated every week.</p>
            </div>
          </li>
          <li className="flex gap-4">
            <span className="tabular shrink-0 text-2xl text-accent-text" aria-hidden="true">03</span>
            <div>
              <h3 className="text-xl font-bold">Fix the mechanics behind the number</h3>
              <p className="mt-2 text-fg-muted">Pro analyzes a swing or pitch video and shows the order your hips, trunk, arm and hand fire in.</p>
            </div>
          </li>
          <li className="flex gap-4">
            <span className="tabular shrink-0 text-2xl text-accent-text" aria-hidden="true">04</span>
            <div>
              <h3 className="text-xl font-bold">Target the right programs</h3>
              <p className="mt-2 text-fg-muted">Pro compares your numbers with each program&apos;s typical recruit so you contact coaches where you fit.</p>
            </div>
          </li>
        </ol>
      </section>

      <section aria-labelledby="plans-title" className="flex flex-col gap-8">
        <h2 id="plans-title" className="text-3xl font-bold">
          Free to start. Pro when you are ready.
        </h2>
        <div className="grid gap-6 md:grid-cols-2">
          <div className="border-2 border-border-subtle p-6">
            <h3 className="text-xl font-bold">Scout</h3>
            <p className="tabular mt-2 text-2xl">$0</p>
            <ul className="mt-4 flex list-disc flex-col gap-2 pl-5 text-fg-muted">
              {FREE_FEATURES.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </div>
          <div className="border-2 border-fg p-6">
            <h3 className="text-xl font-bold">Pro Prospect</h3>
            <p className="tabular mt-2 text-2xl">
              {PRO_PRICES.monthly.label.replace(' per month', '')}
              <span className="text-base text-fg-muted"> per month or {PRO_PRICES.yearly.label.replace(' per year', '')} per year</span>
            </p>
            <ul className="mt-4 flex list-disc flex-col gap-2 pl-5 text-fg-muted">
              {PRO_FEATURES.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </div>
        </div>
        <p className="text-fg-muted">
          Prices shown are the prices charged. Cancel any time from your billing page in one step.{' '}
          <Link href="/legal/refunds">Refund policy</Link>
        </p>
      </section>
      {reviews.length > 0 && (
        <section aria-labelledby="reviews-title" className="flex flex-col gap-6">
          <h2 id="reviews-title" className="text-3xl font-bold">
            From athletes and parents
          </h2>
          <ul className="grid gap-6 md:grid-cols-3">
            {reviews.map((r) => (
              <li key={r.id}>
                <figure className="flex h-full flex-col gap-4 border-2 border-border-subtle p-6">
                  <blockquote>&ldquo;{r.quote}&rdquo;</blockquote>
                  <figcaption className="mt-auto text-sm text-fg-muted">
                    <span className="font-bold text-fg">{r.displayName}</span>, {r.descriptor}
                  </figcaption>
                </figure>
              </li>
            ))}
          </ul>
          <Link href="/reviews">Read all reviews</Link>
        </section>
      )}

      <section aria-labelledby="faq-title" className="flex flex-col gap-6">
        <h2 id="faq-title" className="text-3xl font-bold">
          Questions families ask
        </h2>
        <FaqList faqs={FAQS} />
        <Link href="/faq">All answers on the FAQ page</Link>
      </section>
    </div>
  )
}
