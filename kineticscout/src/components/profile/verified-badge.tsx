import { CheckIcon } from '@/components/icons'

/** Volt fill behind onyx text in both themes: the badge keeps AAA contrast everywhere. */
export function VerifiedBadge({ date }: { date?: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-sm bg-[#E6FF00] px-2 py-0.5 text-sm font-bold text-[#121212]" title={date ? `Confirmed from video on ${date}` : 'Confirmed from video by a KineticScout reviewer'}>
      <CheckIcon size={14} strokeWidth={3} />
      Verified
    </span>
  )
}
