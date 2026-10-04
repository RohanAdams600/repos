'use client'

import { CheckIcon } from '@/components/icons'
import { useMessages } from '@/i18n/client'
import { profileMessages } from '@/i18n/messages/profile'

/** Volt fill behind onyx text in both themes: the badge keeps AAA contrast everywhere. */
export function VerifiedBadge({ date }: { date?: string }) {
  const m = useMessages(profileMessages)
  return (
    <span className="inline-flex items-center gap-1 rounded-sm bg-[#E6FF00] px-2 py-0.5 text-sm font-bold text-[#121212]" title={date ? m.verifiedOn(date) : m.verifiedTitle}>
      <CheckIcon size={14} strokeWidth={3} />
      {m.verified}
    </span>
  )
}
