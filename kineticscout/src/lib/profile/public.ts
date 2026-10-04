import 'server-only'
import type { Handedness, MetricType, Position, Sport } from '@/generated/prisma/enums'
import { positionLabel } from '@/lib/athletes/positions'
import { ageBand } from '@/lib/auth/age'
import { canPublishProfile, type SessionUser } from '@/lib/auth/permissions'
import { db } from '@/lib/db'
import { METRIC_DEFINITIONS } from '@/lib/metrics/definitions'
import { classStandings } from '@/lib/metrics/service'
import { isProfileSlug, makeProfileSlug } from '@/lib/profile/slug'

/** Same lookback as percentiles and matching: recruiters care about current numbers. */
const LOOKBACK_MONTHS = 18

export type ProfileMetric = {
  metricType: MetricType
  label: string
  unit: string
  decimals: number
  best: number
  bestDate: string
  /** True when the best value itself was confirmed from video by a reviewer. */
  bestVerified: boolean
  /** Best reviewer-confirmed value, shown when it differs from the overall best. */
  verifiedBest: number | null
  classPercentile: number | null
  cohortSize: number | null
}

export type ProfileCard = {
  athleteId: string
  slug: string | null
  isPublic: boolean
  firstName: string
  lastName: string
  gradYear: number
  sport: Sport
  position: Position
  positionLabel: string
  bats: Handedness | null
  throws: Handedness | null
  heightInches: number | null
  weightLbs: number | null
  /** Null unless the athlete chose to show it (always shown to the owner). */
  gpa: number | null
  highSchool: string | null
  twitterHandle: string | null
  metrics: ProfileMetric[]
  verifiedCount: number
}

/**
 * Data for the public profile, PDF and share image. `audience: 'public'` applies the athlete's
 * visibility choices; the owner's own preview shows everything they entered.
 */
export async function buildProfileCard(athleteId: string, audience: 'public' | 'owner', now: Date = new Date()): Promise<ProfileCard | null> {
  const profile = await db.athleteProfile.findUnique({
    where: { userId: athleteId },
    select: {
      userId: true,
      publicSlug: true,
      isPublic: true,
      publicShowGpa: true,
      publicShowSchool: true,
      firstName: true,
      lastName: true,
      gradYear: true,
      sport: true,
      primaryPosition: true,
      bats: true,
      throws: true,
      heightInches: true,
      weightLbs: true,
      gpa: true,
      highSchool: true,
      twitterHandle: true,
    },
  })
  if (!profile) return null

  const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - LOOKBACK_MONTHS, now.getUTCDate()))
  const rows = await db.metric.findMany({
    where: { athleteId, date: { gte: since } },
    orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    select: { metricType: true, value: true, date: true, verified: true },
  })

  type Acc = { best: number; bestDate: Date; bestVerified: boolean; verifiedBest: number | null }
  const byType = new Map<MetricType, Acc>()
  for (const row of rows) {
    const def = METRIC_DEFINITIONS[row.metricType]
    const value = Number(row.value)
    const better = (a: number, b: number) => (def.higherIsBetter ? a > b : a < b)
    const acc = byType.get(row.metricType)
    if (!acc) {
      byType.set(row.metricType, { best: value, bestDate: row.date, bestVerified: row.verified, verifiedBest: row.verified ? value : null })
      continue
    }
    // Ties keep the verified row, so an equal verified measurement earns the badge.
    if (better(value, acc.best) || (value === acc.best && row.verified && !acc.bestVerified)) {
      acc.best = value
      acc.bestDate = row.date
      acc.bestVerified = row.verified
    }
    if (row.verified && (acc.verifiedBest === null || better(value, acc.verifiedBest))) acc.verifiedBest = value
  }

  const bestValues = Object.fromEntries([...byType].map(([type, acc]) => [type, acc.best])) as Partial<Record<MetricType, number>>
  const standings = await classStandings(profile.gradYear, bestValues)
  const order = Object.keys(METRIC_DEFINITIONS) as MetricType[]
  const metrics: ProfileMetric[] = [...byType]
    .sort(([a], [b]) => order.indexOf(a) - order.indexOf(b))
    .map(([metricType, acc]) => {
      const def = METRIC_DEFINITIONS[metricType]
      return {
        metricType,
        label: def.label,
        unit: def.unit,
        decimals: def.decimals,
        best: acc.best,
        bestDate: acc.bestDate.toISOString().slice(0, 10),
        bestVerified: acc.bestVerified,
        verifiedBest: acc.verifiedBest !== null && acc.verifiedBest !== acc.best ? acc.verifiedBest : null,
        classPercentile: standings[metricType]?.percentile ?? null,
        cohortSize: standings[metricType]?.cohortSize ?? null,
      }
    })

  const owner = audience === 'owner'
  return {
    athleteId: profile.userId,
    slug: profile.publicSlug,
    isPublic: profile.isPublic,
    firstName: profile.firstName,
    lastName: profile.lastName,
    gradYear: profile.gradYear,
    sport: profile.sport,
    position: profile.primaryPosition,
    positionLabel: positionLabel(profile.primaryPosition),
    bats: profile.bats,
    throws: profile.throws,
    heightInches: profile.heightInches,
    weightLbs: profile.weightLbs,
    gpa: profile.gpa !== null && (owner || profile.publicShowGpa) ? Number(profile.gpa) : null,
    highSchool: owner || profile.publicShowSchool ? profile.highSchool : null,
    twitterHandle: profile.twitterHandle,
    metrics,
    verifiedCount: metrics.filter((m) => m.bestVerified || m.verifiedBest !== null).length,
  }
}

/**
 * Resolves a public link. Visibility is re-checked at read time (not only when the switch was
 * flipped): a minor whose guardian consent is no longer granted, or an account pending deletion,
 * is never shown, even if a stale flag says public.
 */
export async function findPublicAthlete(slug: string): Promise<string | null> {
  if (!isProfileSlug(slug)) return null
  const row = await db.athleteProfile.findUnique({
    where: { publicSlug: slug },
    select: {
      userId: true,
      isPublic: true,
      user: { select: { dateOfBirth: true, deletionScheduledFor: true, guardianConsent: { select: { status: true } } } },
    },
  })
  if (!row?.isPublic || row.user.deletionScheduledFor) return null
  const band = ageBand(row.user.dateOfBirth)
  if (band === 'UNDER_13') return null
  if (band === 'MINOR' && row.user.guardianConsent?.status !== 'GRANTED') return null
  return row.userId
}

/** Same rules as findPublicAthlete, by athlete id (coach search, saved boards, contact requests). */
export async function isPubliclyVisible(athleteId: string): Promise<boolean> {
  const row = await db.athleteProfile.findUnique({ where: { userId: athleteId }, select: { publicSlug: true } })
  return row?.publicSlug ? (await findPublicAthlete(row.publicSlug)) === athleteId : false
}

export type VisibilityResult = { ok: true; slug: string | null } | { ok: false; reason: 'consent-required' | 'deletion-pending' | 'no-profile' }

export async function setProfileVisibility(
  user: SessionUser,
  choice: { isPublic: boolean; showGpa: boolean; showSchool: boolean },
): Promise<VisibilityResult> {
  if (!user.hasAthleteProfile || user.role !== 'ATHLETE') return { ok: false, reason: 'no-profile' }
  if (choice.isPublic && !canPublishProfile(user)) return { ok: false, reason: 'consent-required' }
  if (choice.isPublic && user.deletionScheduledFor) return { ok: false, reason: 'deletion-pending' }

  const current = await db.athleteProfile.findUniqueOrThrow({ where: { userId: user.id }, select: { firstName: true, publicSlug: true, isPublic: true, publicSince: true } })
  const slug = current.publicSlug ?? (choice.isPublic ? makeProfileSlug(current.firstName) : null)
  await db.athleteProfile.update({
    where: { userId: user.id },
    data: {
      isPublic: choice.isPublic,
      publicShowGpa: choice.showGpa,
      publicShowSchool: choice.showSchool,
      publicSlug: slug,
      publicSince: choice.isPublic ? (current.isPublic ? current.publicSince : new Date()) : null,
    },
  })
  return { ok: true, slug }
}

/** Issues a new link; the old one stops working immediately. */
export async function rotateProfileSlug(userId: string): Promise<string> {
  const profile = await db.athleteProfile.findUniqueOrThrow({ where: { userId }, select: { firstName: true } })
  const slug = makeProfileSlug(profile.firstName)
  await db.athleteProfile.update({ where: { userId }, data: { publicSlug: slug } })
  return slug
}

const BOT_PATTERN = /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|telegram|discord|embedly|quora|pinterest|vkshare|skype|headless|lighthouse|curl|wget|python|okhttp|axios/i

export function isLikelyBot(userAgent: string | null): boolean {
  return !userAgent || BOT_PATTERN.test(userAgent)
}

/** Daily counters only: no IP, cookie or visitor identifier is stored. */
export async function recordProfileEvent(athleteId: string, kind: 'view' | 'pdf', now: Date = new Date()): Promise<void> {
  const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  await db.profileViewDay.upsert({
    where: { athleteId_day: { athleteId, day } },
    create: { athleteId, day, views: kind === 'view' ? 1 : 0, pdfDownloads: kind === 'pdf' ? 1 : 0 },
    update: kind === 'view' ? { views: { increment: 1 } } : { pdfDownloads: { increment: 1 } },
  })
}

export async function profileStats(athleteId: string, days = 30, now: Date = new Date()): Promise<{ views: number; pdfDownloads: number }> {
  const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (days - 1)))
  const agg = await db.profileViewDay.aggregate({ where: { athleteId, day: { gte: since } }, _sum: { views: true, pdfDownloads: true } })
  return { views: agg._sum.views ?? 0, pdfDownloads: agg._sum.pdfDownloads ?? 0 }
}
