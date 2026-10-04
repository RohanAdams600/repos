import Link from 'next/link'
import type { ReactNode } from 'react'
import { CoachRecordedBadge } from '@/components/profile/coach-recorded-badge'
import { VerifiedBadge } from '@/components/profile/verified-badge'
import type { ProfileCard } from '@/lib/profile/public'

/** Compact athlete summary for coach search results and boards. */
export function ProspectCard({ card, actions }: { card: ProfileCard; actions?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-lg font-bold">
          {card.firstName} {card.lastName}
        </p>
        <p className="text-sm text-fg-muted">
          Class of <span className="tabular">{card.gradYear}</span> · {card.positionLabel}
          {card.highSchool ? ` · ${card.highSchool}` : ''}
        </p>
      </div>
      {card.metrics.length > 0 ? (
        <ul className="flex flex-wrap gap-x-6 gap-y-2">
          {card.metrics.slice(0, 4).map((m) => (
            <li key={m.metricType} className="flex items-center gap-2">
              <span className="text-sm text-fg-muted">{m.label}</span>
              <span className="tabular font-bold">
                {m.best.toFixed(m.decimals)} {m.unit}
              </span>
              {m.bestVerified ? <VerifiedBadge /> : m.bestCoachRecorded ? <CoachRecordedBadge /> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-fg-muted">No measurements in the last 18 months.</p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        {card.slug && (
          <Link href={`/p/${card.slug}`} target="_blank" className="font-bold">
            Full profile
          </Link>
        )}
        {actions}
      </div>
    </div>
  )
}
