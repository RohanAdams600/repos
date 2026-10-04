import type { Metadata } from 'next'
import Link from 'next/link'
import { Breadcrumbs } from '@/components/layout/breadcrumbs'
import { PercentileCalculatorForm } from '@/components/tools/percentile-calculator-form'
import { K_MIN, WIDENING_STEPS } from '@/lib/insights/build-cohort'

export const metadata: Metadata = {
  title: 'Percentile calculator by build',
  description: 'See how your exit velocity, pitch speed, sprint time, shot speed or throw compares with athletes of a similar age, height and weight.',
  alternates: { canonical: '/tools/percentile-calculator' },
}

export default function PercentileCalculatorPage() {
  const first = WIDENING_STEPS[0]!
  const last = WIDENING_STEPS[WIDENING_STEPS.length - 1]!
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8">
      <div className="flex flex-col gap-3">
        <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'Percentile calculator' }]} />
        <h1 className="text-4xl font-bold">Percentile calculator by build</h1>
        <p className="text-lg text-fg-muted">
          A 5&apos;8&quot;, 150 lb sophomore and a 6&apos;3&quot;, 210 lb senior should not be judged on the same scale. Enter one result and your
          build to see how it compares with KineticScout athletes of a similar age, height and weight.
        </p>
      </div>
      <PercentileCalculatorForm minimumCohort={K_MIN} />
      <section aria-labelledby="method-title" className="flex flex-col gap-3">
        <h2 id="method-title" className="text-2xl font-bold">
          How it works
        </h2>
        <ul className="flex list-disc flex-col gap-2 pl-5 text-fg-muted">
          <li>
            We compare your result with each athlete&apos;s best value from the last 18 months for the same measurement, among athletes within{' '}
            {first.height} inch and {first.weight} lb of you at the same age.
          </li>
          <li>
            If fewer than {K_MIN} athletes match, we widen the range step by step, up to {last.age} years, {last.height} inches and {last.weight} lb,
            and tell you the range used. If there are still too few, we say so instead of guessing.
          </li>
          <li>
            When a licensed national table covers your age and build, we also show your standing in it and name the publisher and edition. Otherwise
            there is no national figure.
          </li>
          <li>Most KineticScout values are logged by athletes themselves. Neither figure is a scouting grade.</li>
          <li>Nothing you type here is saved.</li>
        </ul>
        <p className="text-fg-muted">
          With an account, your dashboard shows this for every measurement you log, plus cross-sport equivalents.{' '}
          <Link href="/sign-up">Create a free profile</Link>.
        </p>
      </section>
    </div>
  )
}
