import type { Metadata } from 'next'
import Link from 'next/link'
import { JsonLd } from '@/components/json-ld'
import { FaqList } from '@/components/marketing/faq-list'
import { buttonVariants } from '@/components/ui/button'
import { formatUsd, planFeatures, PRO_PRICES } from '@/lib/billing/plans'
import { faqJsonLd, faqsFor } from '@/lib/content/faq'
import { pick } from '@/i18n/define'
import { homeMessages } from '@/i18n/messages/home'
import { getLocale, messages } from '@/i18n/server'
import { organizationJsonLd } from '@/lib/content/organization'
import { db } from '@/lib/db'

export async function generateMetadata(): Promise<Metadata> {
  const m = await messages(homeMessages)
  return { title: { absolute: m.title }, description: m.description, alternates: { canonical: '/' } }
}

export default async function HomePage() {
  const locale = await getLocale()
  const m = pick(homeMessages, locale)
  const features = planFeatures(locale)
  const faqs = faqsFor(locale)
  const org = organizationJsonLd()
  const reviews = await db.testimonial
    .findMany({ where: { status: 'PUBLISHED' }, orderBy: { publishedAt: 'desc' }, take: 3, select: { id: true, displayName: true, descriptor: true, quote: true } })
    .catch(() => [])
  const monthly = formatUsd(PRO_PRICES.monthly.amountCents)
  const yearly = formatUsd(PRO_PRICES.yearly.amountCents)
  return (
    <div className="flex flex-col gap-24">
      <JsonLd data={faqJsonLd(faqs)} />
      {org && <JsonLd data={org} />}
      <section aria-labelledby="hero-title" className="grid gap-8 pt-4 lg:grid-cols-[3fr_2fr] lg:items-end">
        <div className="flex flex-col gap-6">
          <h1 id="hero-title" className="text-4xl leading-tight font-bold tracking-tight sm:text-6xl">
            {m.hero}
          </h1>
          <p className="max-w-2xl text-lg text-fg-muted sm:text-xl">{m.lead}</p>
          <div className="flex flex-wrap gap-3">
            <Link href="/sign-up" className={buttonVariants({ variant: 'primary' })}>
              {m.createProfile}
            </Link>
            <Link href="/pricing" className={buttonVariants({ variant: 'secondary' })}>
              {m.comparePlans}
            </Link>
          </div>
        </div>
        <figure className="flex flex-col gap-3">
          <figcaption className="text-sm font-bold text-fg-muted">{m.metricsCaption}</figcaption>
          <dl className="grid grid-cols-2 gap-px border-2 border-border-subtle bg-border-subtle">
            {m.metrics.map(([label, unit]) => (
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
          {m.howTitle}
        </h2>
        <ol className="grid gap-8 md:grid-cols-2">
          {m.steps.map(([title, body], i) => (
            <li key={title} className="flex gap-4">
              <span className="tabular shrink-0 text-2xl text-accent-text" aria-hidden="true">
                {String(i + 1).padStart(2, '0')}
              </span>
              <div>
                <h3 className="text-xl font-bold">{title}</h3>
                <p className="mt-2 text-fg-muted">{body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="plans-title" className="flex flex-col gap-8">
        <h2 id="plans-title" className="text-3xl font-bold">
          {m.plansTitle}
        </h2>
        <div className="grid gap-6 md:grid-cols-2">
          <div className="border-2 border-border-subtle p-6">
            <h3 className="text-xl font-bold">Scout</h3>
            <p className="tabular mt-2 text-2xl">$0</p>
            <ul className="mt-4 flex list-disc flex-col gap-2 pl-5 text-fg-muted">
              {features.free.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </div>
          <div className="border-2 border-fg p-6">
            <h3 className="text-xl font-bold">Pro Prospect</h3>
            <p className="tabular mt-2 text-2xl">
              {monthly}
              <span className="text-base text-fg-muted"> {m.perMonthOr(yearly)}</span>
            </p>
            <ul className="mt-4 flex list-disc flex-col gap-2 pl-5 text-fg-muted">
              {features.pro.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </div>
        </div>
        <p className="text-fg-muted">
          {m.pricesNote} <Link href="/legal/refunds">{m.refundPolicy}</Link>
        </p>
      </section>
      {reviews.length > 0 && (
        <section aria-labelledby="reviews-title" className="flex flex-col gap-6">
          <h2 id="reviews-title" className="text-3xl font-bold">
            {m.reviewsTitle}
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
          <Link href="/reviews">{m.allReviews}</Link>
        </section>
      )}

      <section aria-labelledby="faq-title" className="flex flex-col gap-6">
        <h2 id="faq-title" className="text-3xl font-bold">
          {m.faqTitle}
        </h2>
        <FaqList faqs={faqs} />
        <Link href="/faq">{m.allFaq}</Link>
      </section>
    </div>
  )
}
