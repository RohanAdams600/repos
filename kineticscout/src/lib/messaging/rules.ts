/** In-app messaging (Phase 6), pure rules. */
export const MESSAGE_POLICY = {
  maxLength: 2000,
  /** Per sender, across all threads. */
  perHour: 30,
  /** A coach can send this many messages in a row before the athlete replies. */
  maxUnansweredFromCoach: 3,
  /** Closed conversations are deleted this long after closing, unless a report is still open. */
  retentionDaysAfterClose: 365,
} as const

export function messageProblem(body: string): string | null {
  const trimmed = body.trim()
  if (trimmed.length === 0) return 'Write a message first.'
  if (trimmed.length > MESSAGE_POLICY.maxLength) return `Keep messages under ${MESSAGE_POLICY.maxLength} characters.`
  return null
}

/** Trailing run of messages from the same sender, newest last. */
export function unansweredRun(senders: readonly string[], senderId: string): number {
  let run = 0
  for (let i = senders.length - 1; i >= 0 && senders[i] === senderId; i--) run++
  return run
}

export const CLOSED_BY_LABEL: Record<string, string> = {
  athlete: 'The athlete ended this conversation.',
  coach: 'The coach ended this conversation.',
  guardian: 'A parent or guardian ended this conversation.',
  block: 'This conversation ended because the athlete blocked the coach.',
  consent: 'This conversation ended because parental consent was withdrawn.',
  suspended: 'This conversation ended because the coach account was suspended.',
  staff: 'KineticScout staff ended this conversation.',
}
