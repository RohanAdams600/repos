'use client'

import { useMessages } from '@/i18n/client'
import { profileMessages } from '@/i18n/messages/profile'

/**
 * Outlined, not filled: the volt fill stays reserved for Verified, so the two never look alike.
 * The attribution is shown as text next to the badge wherever it appears.
 */
export function CoachRecordedBadge() {
  const m = useMessages(profileMessages)
  return <span className="inline-flex items-center rounded-sm border-2 border-fg px-2 py-0.5 text-sm font-bold">{m.coachRecorded}</span>
}
