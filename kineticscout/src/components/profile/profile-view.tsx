import { CoachRecordedBadge } from '@/components/profile/coach-recorded-badge'
import { VerifiedBadge } from '@/components/profile/verified-badge'
import { formatHeight } from '@/lib/profile/format'
import type { ProfileCard } from '@/lib/profile/public'

/** Shared by the public page and the owner's preview, so what the athlete sees is what recruiters see. */
export function ProfileView({ card }: { card: ProfileCard }) {
  const sides = [card.bats ? `Bats ${card.bats === 'RIGHT' ? 'right' : 'left'}` : null, card.throws ? `throws ${card.throws === 'RIGHT' ? 'right' : 'left'}` : null]
    .filter(Boolean)
    .join(', ')
  const facts: { label: string; value: string; numeric: boolean }[] = [
    ...(card.heightInches ? [{ label: 'Height', value: formatHeight(card.heightInches), numeric: true }] : []),
    ...(card.weightLbs ? [{ label: 'Weight', value: `${card.weightLbs} lb`, numeric: true }] : []),
    ...(card.gpa !== null ? [{ label: 'GPA', value: card.gpa.toFixed(2), numeric: true }] : []),
    ...(card.highSchool ? [{ label: 'High school', value: card.highSchool, numeric: false }] : []),
  ]

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-4xl font-bold break-words">
          {card.firstName} {card.lastName}
        </h1>
        <p className="text-lg text-fg-muted">
          Class of <span className="tabular">{card.gradYear}</span> · {card.positionLabel}
          {sides ? ` · ${sides.charAt(0).toUpperCase()}${sides.slice(1)}` : ''}
        </p>
        {card.twitterHandle && (
          <p>
            <a href={`https://x.com/${card.twitterHandle}`} rel="noopener noreferrer nofollow" target="_blank">
              @{card.twitterHandle} on X
            </a>
          </p>
        )}
      </header>

      {facts.length > 0 && (
        <dl className="grid grid-cols-2 gap-4 border-y-2 border-border-subtle py-4 sm:grid-cols-4">
          {facts.map((f) => (
            <div key={f.label} className="flex min-w-0 flex-col gap-1">
              <dt className="text-sm font-bold text-fg-muted uppercase">{f.label}</dt>
              <dd className={f.numeric ? 'tabular text-xl font-bold' : 'text-lg font-bold break-words'}>{f.value}</dd>
            </div>
          ))}
        </dl>
      )}

      <section aria-labelledby="measurements-title" className="flex flex-col gap-4">
        <h2 id="measurements-title" className="text-2xl font-bold">
          Measurements
        </h2>
        {card.metrics.length === 0 ? (
          <p className="text-fg-muted">No measurements logged in the last 18 months.</p>
        ) : (
          <ul className="flex flex-col">
            {card.metrics.map((m) => (
              <li key={m.metricType} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 border-b-2 border-border-subtle py-3 sm:grid-cols-[1fr_auto_auto]">
                <div className="flex min-w-0 flex-col">
                  <span className="font-bold">{m.label}</span>
                  <span className="text-sm text-fg-muted">
                    Measured <span className="tabular">{m.bestDate}</span>
                    {m.bestCoachRecorded && m.bestRecordedBy && <> · Recorded by {m.bestRecordedBy.replace(/ on \d{4}-\d{2}-\d{2}$/, '')}</>}
                    {m.classPercentile !== null && (
                      <>
                        {' '}
                        · Top <span className="tabular">{Math.max(1, 100 - m.classPercentile)}%</span> of the class
                      </>
                    )}
                  </span>
                </div>
                <span className="tabular text-right text-2xl font-bold">
                  {m.best.toFixed(m.decimals)}
                  <span className="ml-1 text-base font-normal text-fg-muted">{m.unit}</span>
                </span>
                <span className="col-span-2 flex justify-start sm:col-span-1 sm:justify-end">
                  {m.bestVerified ? (
                    <VerifiedBadge />
                  ) : m.bestCoachRecorded ? (
                    <CoachRecordedBadge />
                  ) : m.verifiedBest !== null ? (
                    <span className="text-sm text-fg-muted">
                      Verified best <span className="tabular">{m.verifiedBest.toFixed(m.decimals)}</span>
                    </span>
                  ) : (
                    <span className="text-sm text-fg-muted">Self-reported</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="text-sm text-fg-muted">
          Verified means a KineticScout reviewer confirmed the value from video of the measurement. Coach-recorded means a high school or travel
          coach, checked by our staff against their school or club staff page, recorded it at a testing day and the athlete accepted it. Class standing compares the best value of the
          last 18 months with KineticScout athletes in the same graduating class, and is shown only for groups of at least 25 athletes. It is not a
          national ranking.
        </p>
      </section>
    </div>
  )
}
