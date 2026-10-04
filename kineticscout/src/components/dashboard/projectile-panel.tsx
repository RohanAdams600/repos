'use client'

import { useMessages } from '@/i18n/client'
import { analysisMessages } from '@/i18n/messages/analysis'
import type { ProjectileEstimate, ProjectileWarning } from '@/lib/biomechanics/projectile'

/** Beta results for puck or ball tracking, always with the limits next to the numbers. */
export function ProjectilePanel({ estimate, noun }: { estimate: ProjectileEstimate; noun: string }) {
  const m = useMessages(analysisMessages).projectile
  return (
    <section aria-labelledby="projectile-title" className="flex flex-col gap-4 border-2 border-border-subtle p-6">
      <h2 id="projectile-title" className="text-xl font-bold">
        {m.title(noun)} <span className="text-base font-normal text-fg-muted">{m.beta}</span>
      </h2>
      {estimate.label && (
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-[auto_1fr]">
          <dt className="text-fg-muted">{m.speed}</dt>
          <dd className="tabular font-bold">{estimate.speedMph !== null ? m.speedValue(estimate.speedMph.toFixed(0)) : m.notAvailable}</dd>
          {estimate.launchAngleDeg !== null && (
            <>
              <dt className="text-fg-muted">{m.launch}</dt>
              <dd className="tabular">
                {m.launchValue(Math.abs(estimate.launchAngleDeg), estimate.launchAngleDeg >= 0, estimate.direction)}
              </dd>
            </>
          )}
        </dl>
      )}
      {estimate.warnings.length > 0 && (
        <ul className="flex list-disc flex-col gap-1 pl-5 text-fg-muted">
          {estimate.warnings.map((w) => (
            <li key={w}>{m.warnings[w as ProjectileWarning] ?? w}</li>
          ))}
        </ul>
      )}
      <p className="text-sm text-fg-muted">{m.limits(noun)}</p>
    </section>
  )
}
