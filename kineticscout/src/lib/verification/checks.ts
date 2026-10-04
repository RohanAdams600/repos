import type { VerificationRejection } from '@/generated/prisma/enums'
import { EVIDENCE_POLICY } from '@/lib/verification/policy'

export type EvidenceFacts = {
  container: 'mp4' | 'quicktime' | null
  sizeBytes: number
  durationMs: number | null
  recordedAt: Date | null
  metricDate: Date
  /** Same file already submitted by a different athlete. */
  usedByOtherAthlete: boolean
  /** Same file already attached to another of this athlete's measurements. */
  usedForOtherMetric: boolean
}

export type EvidenceChecks = {
  container: 'ok' | 'invalid'
  size: 'ok' | 'too-large'
  duration: 'ok' | 'too-long' | 'unknown'
  recordedDate: 'matches' | 'differs' | 'unknown'
  recordedDaysFromMeasurement: number | null
  reuse: 'none' | 'other-metric' | 'other-athlete'
}

export type EvidenceOutcome = { decision: 'review'; checks: EvidenceChecks } | { decision: 'reject'; reason: VerificationRejection; checks: EvidenceChecks }

/**
 * Automated pre-checks. They can reject a submission that cannot be valid evidence, and they flag
 * anything a reviewer should look at closely, but they never verify a value: a person does that.
 * Container metadata can be wrong or missing, so a date mismatch is a flag, not a rejection.
 */
export function evaluateEvidence(facts: EvidenceFacts): EvidenceOutcome {
  const days = facts.recordedAt ? Math.round(Math.abs(facts.recordedAt.getTime() - facts.metricDate.getTime()) / 86_400_000) : null
  const checks: EvidenceChecks = {
    container: facts.container ? 'ok' : 'invalid',
    size: facts.sizeBytes <= EVIDENCE_POLICY.maxBytes ? 'ok' : 'too-large',
    duration: facts.durationMs === null ? 'unknown' : facts.durationMs <= EVIDENCE_POLICY.maxDurationMs ? 'ok' : 'too-long',
    recordedDate: days === null ? 'unknown' : days <= EVIDENCE_POLICY.recordedWindowDays ? 'matches' : 'differs',
    recordedDaysFromMeasurement: days,
    reuse: facts.usedByOtherAthlete ? 'other-athlete' : facts.usedForOtherMetric ? 'other-metric' : 'none',
  }
  if (checks.container === 'invalid' || checks.size === 'too-large') return { decision: 'reject', reason: 'UNREADABLE_FILE', checks }
  if (checks.duration === 'too-long') return { decision: 'reject', reason: 'TOO_LONG', checks }
  if (checks.reuse === 'other-athlete') return { decision: 'reject', reason: 'DUPLICATE_VIDEO', checks }
  return { decision: 'review', checks }
}
