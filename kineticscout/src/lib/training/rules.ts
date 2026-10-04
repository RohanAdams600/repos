import { z } from 'zod'
import type { FindingCode } from '@/lib/biomechanics/types'
import type { MetricType, MotionType, Sport } from '@/generated/prisma/enums'
import { sanitizeText } from '@/lib/security/sanitize'

export const TRAINING_POLICY = {
  weeks: 4,
  maxItems: 4,
  defaultTimesPerWeek: 3,
  baselineWindowDays: 90,
  /** Finished plans are archived this long after their end date. */
  archiveAfterDays: 14,
} as const

export const FINDING_CODES: readonly FindingCode[] = ['TRUNK_LEADS_PELVIS', 'ARM_LEADS_TRUNK', 'HAND_LEADS_ARM', 'LOW_HIP_SHOULDER_SEPARATION', 'SEGMENTS_FIRE_TOGETHER', 'NO_SPEED_GAIN_PELVIS_TO_TRUNK']

/** Short names for the coaching focus behind each analysis finding. */
export const FOCUS_LABEL: Record<FindingCode, string> = {
  TRUNK_LEADS_PELVIS: 'Hips start the rotation',
  ARM_LEADS_TRUNK: 'Trunk before arm',
  HAND_LEADS_ARM: 'Arm before hand',
  LOW_HIP_SHOULDER_SEPARATION: 'Hip and shoulder separation',
  SEGMENTS_FIRE_TOGETHER: 'Sequencing one segment at a time',
  NO_SPEED_GAIN_PELVIS_TO_TRUNK: 'Speed transfer from hips to trunk',
}

export const MOTION_LABEL: Record<MotionType, string> = { SWING: 'Swing', PITCH: 'Pitch', HOCKEY_SHOT: 'Hockey shot', FOOTBALL_THROW: 'Throw' }
export const MOTION_SPORT: Record<MotionType, Sport> = { SWING: 'BASEBALL', PITCH: 'BASEBALL', HOCKEY_SHOT: 'HOCKEY', FOOTBALL_THROW: 'FOOTBALL' }

/** Measurements a plan for each motion can follow. The first is the default. */
export const TRACKED_METRICS: Record<MotionType, readonly MetricType[]> = {
  SWING: ['EXIT_VELOCITY', 'BAT_SPEED'],
  PITCH: ['PITCH_VELO'],
  HOCKEY_SHOT: ['SLAPSHOT_SPEED', 'WRIST_SHOT_SPEED'],
  FOOTBALL_THROW: ['THROW_VELOCITY', 'THROW_DISTANCE'],
}

const SEVERITY = { high: 0, medium: 1, low: 2 } as const

export type DrillCandidate = { id: string; title: string; motionTypes: MotionType[]; focusCodes: string[] }
export type PlanFinding = { code: FindingCode; severity: 'high' | 'medium' | 'low' }

/**
 * Chooses drills for an analysis: the most serious findings first, one drill per finding, preferring
 * drills aimed at fewer focus areas (more targeted), never the same drill twice.
 */
export function pickDrills(findings: readonly PlanFinding[], drills: readonly DrillCandidate[], motion: MotionType): { drillId: string; focusCode: FindingCode }[] {
  const usable = drills.filter((d) => d.motionTypes.includes(motion))
  const ordered = [...findings].sort((a, b) => SEVERITY[a.severity] - SEVERITY[b.severity])
  const seenCodes = new Set<FindingCode>()
  const used = new Set<string>()
  const picks: { drillId: string; focusCode: FindingCode }[] = []
  for (const finding of ordered) {
    if (picks.length >= TRAINING_POLICY.maxItems) break
    if (seenCodes.has(finding.code)) continue
    seenCodes.add(finding.code)
    const match = usable
      .filter((d) => d.focusCodes.includes(finding.code) && !used.has(d.id))
      .sort((a, b) => a.focusCodes.length - b.focusCodes.length || a.title.localeCompare(b.title))[0]
    if (match) {
      used.add(match.id)
      picks.push({ drillId: match.id, focusCode: finding.code })
    }
  }
  return picks
}

export type ProgressPoint = { date: Date; value: number }

/**
 * Measurements logged since the plan started, next to the baseline. Neutral by design: it reports
 * the numbers and never says the drills caused a change.
 */
export function progressSummary(baseline: ProgressPoint | null, since: readonly ProgressPoint[], higherIsBetter: boolean) {
  if (since.length === 0) return { count: 0, best: null, latest: null, changeFromBaseline: null }
  const latest = [...since].sort((a, b) => b.date.getTime() - a.date.getTime())[0]!
  const best = since.reduce((a, b) => (higherIsBetter ? (b.value > a.value ? b : a) : b.value < a.value ? b : a))
  const change = baseline ? Math.round((best.value - baseline.value) * 100) / 100 : null
  return { count: since.length, best, latest, changeFromBaseline: change }
}

/** Monday-start week containing `day` (UTC), for "times this week". */
export function weekBounds(day: Date): { start: Date; end: Date } {
  const d = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()))
  const offset = (d.getUTCDay() + 6) % 7
  const start = new Date(d.getTime() - offset * 86_400_000)
  return { start, end: new Date(start.getTime() + 6 * 86_400_000) }
}

const line = (max: number, label: string) =>
  z
    .string({ error: `Enter ${label}` })
    .transform((v) => sanitizeText(v))
    .pipe(z.string().min(1, `Enter ${label}`).max(max, `Use at most ${max} characters`))

export const drillInputSchema = z
  .object({
    title: line(120, 'a title'),
    sport: z.enum(['BASEBALL', 'HOCKEY', 'FOOTBALL']),
    motionTypes: z.array(z.enum(['SWING', 'PITCH', 'HOCKEY_SHOT', 'FOOTBALL_THROW'])).min(1, 'Choose at least one motion').max(4),
    focusCodes: z.array(z.enum(FINDING_CODES as [FindingCode, ...FindingCode[]])).min(1, 'Choose at least one focus area').max(6),
    summary: line(300, 'a summary'),
    steps: z.array(line(300, 'the step')).min(1, 'Add at least one step').max(8, 'Use at most 8 steps'),
    equipment: z.string().max(200).optional().transform((v) => (v ? sanitizeText(v) || null : null)),
    minutes: z.coerce.number().int().min(5, 'At least 5 minutes').max(60, 'At most 60 minutes'),
    safetyNote: line(300, 'a safety note'),
    source: z.enum(['STAFF', 'LICENSED']),
    author: line(160, 'the author'),
    licensor: z.string().max(160).optional().transform((v) => (v ? sanitizeText(v) || null : null)),
    licenceRef: z.string().max(200).optional().transform((v) => (v ? sanitizeText(v) || null : null)),
    licenceExpiresAt: z
      .string()
      .optional()
      .transform((v, ctx) => {
        if (!v) return null
        const d = new Date(`${v}T00:00:00Z`)
        if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(d.getTime())) {
          ctx.addIssue({ code: 'custom', message: 'Enter a valid date' })
          return z.NEVER
        }
        return d
      }),
  })
  .superRefine((v, ctx) => {
    if (v.source === 'LICENSED' && (!v.licensor || !v.licenceRef)) ctx.addIssue({ code: 'custom', path: ['licensor'], message: 'Licensed drills need the licensor and licence reference' })
    if (v.source === 'STAFF' && (v.licensor || v.licenceRef)) ctx.addIssue({ code: 'custom', path: ['source'], message: 'Choose Licensed for a drill with licence details' })
    const sportOf = { SWING: 'BASEBALL', PITCH: 'BASEBALL', HOCKEY_SHOT: 'HOCKEY', FOOTBALL_THROW: 'FOOTBALL' } as const
    if (v.motionTypes.some((m) => sportOf[m] !== v.sport)) ctx.addIssue({ code: 'custom', path: ['motionTypes'], message: 'Choose motions from the drill’s sport' })
  })
export type DrillInput = z.output<typeof drillInputSchema>
