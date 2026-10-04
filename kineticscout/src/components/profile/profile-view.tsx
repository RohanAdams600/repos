import { CoachRecordedBadge } from '@/components/profile/coach-recorded-badge'
import { VerifiedBadge } from '@/components/profile/verified-badge'
import { formatHeight } from '@/lib/profile/format'
import type { ProfileCard } from '@/lib/profile/public'
import { pick } from '@/i18n/define'
import { domain } from '@/i18n/messages/domain'
import { profileMessages } from '@/i18n/messages/profile'
import { getLocale } from '@/i18n/server'

/** Shared by the public page and the owner's preview, so what the athlete sees is what recruiters see. */
export async function ProfileView({ card }: { card: ProfileCard }) {
  const locale = await getLocale()
  const m = pick(profileMessages, locale)
  const d = domain(locale)
  const sides = [card.bats ? m.bats(card.bats === 'RIGHT' ? 'right' : 'left') : null, card.throws ? m.throws(card.throws === 'RIGHT' ? 'right' : 'left') : null]
    .filter(Boolean)
    .join(', ')
  const facts: { label: string; value: string; numeric: boolean }[] = [
    ...(card.heightInches ? [{ label: m.height, value: formatHeight(card.heightInches), numeric: true }] : []),
    ...(card.weightLbs ? [{ label: m.weight, value: `${card.weightLbs} lb`, numeric: true }] : []),
    ...(card.gpa !== null ? [{ label: m.gpa, value: card.gpa.toFixed(2), numeric: true }] : []),
    ...(card.highSchool ? [{ label: m.highSchool, value: card.highSchool, numeric: false }] : []),
  ]

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-4xl font-bold break-words">
          {card.firstName} {card.lastName}
        </h1>
        <p className="text-lg text-fg-muted">
          {m.classOf} <span className="tabular">{card.gradYear}</span> · {d.position[card.position]}
          {sides ? ` · ${sides.charAt(0).toUpperCase()}${sides.slice(1)}` : ''}
        </p>
        {card.twitterHandle && (
          <p>
            <a href={`https://x.com/${card.twitterHandle}`} rel="noopener noreferrer nofollow" target="_blank">
              @{card.twitterHandle} {m.onX}
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
          {m.measurements}
        </h2>
        {card.metrics.length === 0 ? (
          <p className="text-fg-muted">{m.noMeasurements}</p>
        ) : (
          <ul className="flex flex-col">
            {card.metrics.map((mt) => (
              <li key={mt.metricType} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 border-b-2 border-border-subtle py-3 sm:grid-cols-[1fr_auto_auto]">
                <div className="flex min-w-0 flex-col">
                  <span className="font-bold">{d.metric[mt.metricType]}</span>
                  <span className="text-sm text-fg-muted">
                    {m.measured} <span className="tabular">{mt.bestDate}</span>
                    {mt.bestCoachRecorded && mt.bestRecordedBy && <> · {m.recordedBy} {mt.bestRecordedBy.replace(/ on \d{4}-\d{2}-\d{2}$/, '')}</>}
                    {mt.classPercentile !== null && (
                      <>
                        {' '}
                        · {m.topOfClass(Math.max(1, 100 - mt.classPercentile))}
                      </>
                    )}
                  </span>
                </div>
                <span className="tabular text-right text-2xl font-bold">
                  {mt.best.toFixed(mt.decimals)}
                  <span className="ml-1 text-base font-normal text-fg-muted">{mt.unit}</span>
                </span>
                <span className="col-span-2 flex justify-start sm:col-span-1 sm:justify-end">
                  {mt.bestVerified ? (
                    <VerifiedBadge />
                  ) : mt.bestCoachRecorded ? (
                    <CoachRecordedBadge />
                  ) : mt.verifiedBest !== null ? (
                    <span className="text-sm text-fg-muted">
                      {m.verifiedBest} <span className="tabular">{mt.verifiedBest.toFixed(mt.decimals)}</span>
                    </span>
                  ) : (
                    <span className="text-sm text-fg-muted">{m.selfReported}</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="text-sm text-fg-muted">{m.explainer}</p>
      </section>
    </div>
  )
}
