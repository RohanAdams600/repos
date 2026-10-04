import type { Metadata } from 'next'
import Link from 'next/link'
import { JsonLd } from '@/components/json-ld'
import { Breadcrumbs } from '@/components/layout/breadcrumbs'
import { FaqList } from '@/components/marketing/faq-list'
import { FAQS, faqJsonLd } from '@/lib/content/faq'

export const metadata: Metadata = {
  title: 'Frequently asked questions',
  description: 'How percentiles are calculated, who can see your data, how accurate video analysis is, what the College Matchmaker does, and how billing works.',
  alternates: { canonical: '/faq' },
}

export default function FaqPage() {
  return (
    <div className="flex max-w-4xl flex-col gap-8">
      <JsonLd data={faqJsonLd()} />
      <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'FAQ' }]} />
      <div className="flex flex-col gap-3">
        <h1 className="text-4xl font-bold">Frequently asked questions</h1>
        <p className="text-lg text-fg-muted">
          Straight answers about how KineticScout works. Still stuck? <Link href="/contact">Contact us</Link> and we will reply within 2 business days.
        </p>
      </div>
      <FaqList faqs={FAQS} headingLevel="h2" />
    </div>
  )
}
