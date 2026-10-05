'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { CoachRecordedBadge } from '@/components/profile/coach-recorded-badge'
import { VerifiedBadge } from '@/components/profile/verified-badge'
import type { ProfileCard } from '@/lib/profile/public'
import { useMessages } from '@/i18n/client'
import { coachMessages } from '@/i18n/messages/coach'
import { domainMessages } from '@/i18n/messages/domain'

/** Compact athlete summary for coach search results and boards. */
export function ProspectCard({ card, actions }: { card: ProfileCard; actions?: ReactNode }) {
  const m = useMessages(coachMessages).card
  const d = useMessages(domainMessages)
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-lg font-bold">
          {card.firstName} {card.lastName}
        </p>
        <p className="text-sm text-fg-muted">
          {m.line(card.gradYear, d.position[card.position] ?? card.positionLabel)}
          {card.highSchool ? ` · ${card.highSchool}` : ''}
        </p>
      </div>
      {card.metrics.length > 0 ? (
        <ul className="flex flex-wrap gap-x-6 gap-y-2">
          {card.metrics.slice(0, 4).map((x) => (
            <li key={x.metricType} className="flex items-center gap-2">
              <span className="text-sm text-fg-muted">{d.metric[x.metricType]}</span>
              <span className="tabular font-bold">
                {x.best.toFixed(x.decimals)} {x.unit}
              </span>
              {x.bestVerified ? <VerifiedBadge /> : x.bestCoachRecorded ? <CoachRecordedBadge /> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-fg-muted">{m.noMetrics}</p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        {card.slug && (
          <Link href={`/p/${card.slug}`} target="_blank" className="font-bold">
            {m.full}
          </Link>
        )}
        {actions}
      </div>
    </div>
  )
}
