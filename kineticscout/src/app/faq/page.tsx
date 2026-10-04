import type { Metadata } from 'next'
import Link from 'next/link'
import { JsonLd } from '@/components/json-ld'
import { Breadcrumbs } from '@/components/layout/breadcrumbs'
import { FaqList } from '@/components/marketing/faq-list'
import { chromeMessages } from '@/i18n/messages/chrome'
import { faqPageMessages } from '@/i18n/messages/pricing'
import { getLocale, messages } from '@/i18n/server'
import { faqJsonLd, faqsFor } from '@/lib/content/faq'

export async function generateMetadata(): Promise<Metadata> {
  const m = await messages(faqPageMessages)
  return { title: m.title, description: m.description, alternates: { canonical: '/faq' } }
}

export default async function FaqPage() {
  const faqs = faqsFor(await getLocale())
  const [m, c] = await Promise.all([messages(faqPageMessages), messages(chromeMessages)])
  return (
    <div className="flex max-w-4xl flex-col gap-8">
      <JsonLd data={faqJsonLd(faqs)} />
      <Breadcrumbs items={[{ label: c.homeCrumb, href: '/' }, { label: m.crumb }]} />
      <div className="flex flex-col gap-3">
        <h1 className="text-4xl font-bold">{m.title}</h1>
        <p className="text-lg text-fg-muted">
          {m.lead} <Link href="/contact">{m.contactUs}</Link> {m.reply}
        </p>
      </div>
      <FaqList faqs={faqs} headingLevel="h2" />
    </div>
  )
}
