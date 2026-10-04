import type { Metadata } from 'next'
import Link from 'next/link'
import { Breadcrumbs } from '@/components/layout/breadcrumbs'
import { PercentileCalculatorForm } from '@/components/tools/percentile-calculator-form'
import { K_MIN, WIDENING_STEPS } from '@/lib/insights/build-cohort'
import { calculatorMessages } from '@/i18n/messages/calculator'
import { chromeMessages } from '@/i18n/messages/chrome'
import { messages } from '@/i18n/server'

export async function generateMetadata(): Promise<Metadata> {
  const m = await messages(calculatorMessages)
  return { title: m.title, description: m.description, alternates: { canonical: '/tools/percentile-calculator' } }
}

export default async function PercentileCalculatorPage() {
  const [m, c] = await Promise.all([messages(calculatorMessages), messages(chromeMessages)])
  const first = WIDENING_STEPS[0]!
  const last = WIDENING_STEPS[WIDENING_STEPS.length - 1]!
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8">
      <div className="flex flex-col gap-3">
        <Breadcrumbs items={[{ label: c.homeCrumb, href: '/' }, { label: m.crumb }]} />
        <h1 className="text-4xl font-bold">{m.title}</h1>
        <p className="text-lg text-fg-muted">{m.lead}</p>
      </div>
      <PercentileCalculatorForm minimumCohort={K_MIN} />
      <section aria-labelledby="method-title" className="flex flex-col gap-3">
        <h2 id="method-title" className="text-2xl font-bold">
          {m.howTitle}
        </h2>
        <ul className="flex list-disc flex-col gap-2 pl-5 text-fg-muted">
          <li>{m.how1(first.height, first.weight)}</li>
          <li>{m.how2(K_MIN, last.age, last.height, last.weight)}</li>
          <li>{m.how3}</li>
          <li>{m.how4}</li>
          <li>{m.how5}</li>
        </ul>
        <p className="text-fg-muted">
          {m.withAccount} <Link href="/sign-up">{m.createProfile}</Link>.
        </p>
      </section>
    </div>
  )
}
