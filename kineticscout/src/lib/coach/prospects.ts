import 'server-only'
import { Prisma } from '@/generated/prisma/client'
import type { MetricType, Position, Sport } from '@/generated/prisma/enums'
import { positionDbValue } from '@/lib/athletes/positions'
import { db } from '@/lib/db'
import { METRIC_DEFINITIONS, metricDbValue } from '@/lib/metrics/definitions'
import { buildProfileCard, isPubliclyVisible, type ProfileCard } from '@/lib/profile/public'

export const PROSPECT_PAGE_SIZE = 20
const LOOKBACK_MONTHS = 18

export type ProspectFilters = {
  sport: Sport
  gradYearMin?: number
  gradYearMax?: number
  positions?: Position[]
  /** "At least" for higher-is-better metrics, "at most" for timed events. Up to three. */
  metrics?: { metricType: MetricType; threshold: number }[]
  /** Count only reviewer-verified measurements toward the metric filters and sort. */
  verifiedOnly?: boolean
  sortBy?: MetricType | null
  page?: number
}

export type ProspectResult = { card: ProfileCard; saved: boolean; requestStatus: string | null }

function sinceDate(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - LOOKBACK_MONTHS, now.getUTCDate()))
}

/**
 * Public athletes only, with the same rules as the public profile page (guardian consent for
 * minors, no pending deletion) applied in SQL before any filter, plus athletes who blocked this
 * coach removed. Metric filters and the sort use the best value of the last 18 months.
 */
export async function searchProspects(coachId: string, filters: ProspectFilters, now: Date = new Date()): Promise<{ results: ProspectResult[]; total: number; page: number; pageCount: number }> {
  const page = Math.max(1, Math.min(50, filters.page ?? 1))
  const since = sinceDate(now)
  const adultBornOnOrBefore = new Date(Date.UTC(now.getUTCFullYear() - 18, now.getUTCMonth(), now.getUTCDate()))
  const verified = filters.verifiedOnly ? Prisma.sql`AND m.verified` : Prisma.empty

  const conditions: Prisma.Sql[] = [
    Prisma.sql`p.is_public AND p.public_slug IS NOT NULL`,
    Prisma.sql`p.sport = ${filters.sport}::"Sport"`,
    Prisma.sql`u.deletion_scheduled_for IS NULL`,
    Prisma.sql`(u.date_of_birth <= ${adultBornOnOrBefore} OR gc.status = 'GRANTED')`,
    Prisma.sql`NOT EXISTS (SELECT 1 FROM coach_blocks b WHERE b.athlete_id = p.user_id AND b.coach_id = ${coachId}::uuid)`,
  ]
  if (filters.gradYearMin) conditions.push(Prisma.sql`p.grad_year >= ${filters.gradYearMin}`)
  if (filters.gradYearMax) conditions.push(Prisma.sql`p.grad_year <= ${filters.gradYearMax}`)
  if (filters.positions?.length) {
    conditions.push(Prisma.sql`p.primary_position IN (${Prisma.join(filters.positions.map((pos) => Prisma.sql`${positionDbValue(pos)}::"Position"`))})`)
  }
  for (const f of (filters.metrics ?? []).slice(0, 3)) {
    const compare = METRIC_DEFINITIONS[f.metricType].higherIsBetter ? Prisma.sql`m.value >= ${f.threshold}` : Prisma.sql`m.value <= ${f.threshold}`
    conditions.push(
      Prisma.sql`EXISTS (SELECT 1 FROM metrics m WHERE m.athlete_id = p.user_id AND m.metric_type = ${metricDbValue(f.metricType)}::"MetricType" AND m.date >= ${since} AND ${compare} ${verified})`,
    )
  }

  let sortExpr = Prisma.sql`NULL::numeric`
  let sortDirection = Prisma.sql`DESC`
  if (filters.sortBy) {
    const higher = METRIC_DEFINITIONS[filters.sortBy].higherIsBetter
    sortExpr = Prisma.sql`(SELECT ${higher ? Prisma.sql`MAX(m.value)` : Prisma.sql`MIN(m.value)`} FROM metrics m WHERE m.athlete_id = p.user_id AND m.metric_type = ${metricDbValue(filters.sortBy)}::"MetricType" AND m.date >= ${since} ${verified})`
    sortDirection = higher ? Prisma.sql`DESC` : Prisma.sql`ASC`
  }

  const rows = await db.$queryRaw<{ user_id: string; total: bigint }[]>`
    SELECT p.user_id, COUNT(*) OVER () AS total
    FROM athlete_profiles p
    JOIN users u ON u.id = p.user_id
    LEFT JOIN guardian_consents gc ON gc.user_id = p.user_id
    WHERE ${Prisma.join(conditions, ' AND ')}
    ORDER BY ${sortExpr} ${sortDirection} NULLS LAST, p.updated_at DESC, p.user_id
    LIMIT ${PROSPECT_PAGE_SIZE} OFFSET ${(page - 1) * PROSPECT_PAGE_SIZE}`

  const total = rows.length ? Number(rows[0]!.total) : 0
  const ids = rows.map((r) => r.user_id)
  const [cards, saved, requests] = await Promise.all([
    Promise.all(ids.map((id) => buildProfileCard(id, 'public', now))),
    db.savedProspect.findMany({ where: { coachId, athleteId: { in: ids } }, select: { athleteId: true } }),
    db.contactRequest.findMany({ where: { coachId, athleteId: { in: ids } }, orderBy: { createdAt: 'desc' }, select: { athleteId: true, status: true } }),
  ])
  const savedSet = new Set(saved.map((s) => s.athleteId))
  const latestRequest = new Map<string, string>()
  for (const r of requests) if (!latestRequest.has(r.athleteId)) latestRequest.set(r.athleteId, r.status)
  return {
    results: cards.filter((c): c is ProfileCard => c !== null).map((card) => ({ card, saved: savedSet.has(card.athleteId), requestStatus: latestRequest.get(card.athleteId) ?? null })),
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / PROSPECT_PAGE_SIZE)),
  }
}

export class ProspectUnavailableError extends Error {
  constructor() {
    super('This athlete profile is not available.')
    this.name = 'ProspectUnavailableError'
  }
}

async function assertReachable(coachId: string, athleteId: string): Promise<void> {
  const blocked = await db.coachBlock.findUnique({ where: { athleteId_coachId: { athleteId, coachId } }, select: { athleteId: true } })
  if (blocked || !(await isPubliclyVisible(athleteId))) throw new ProspectUnavailableError()
}

export async function saveProspect(coachId: string, athleteId: string): Promise<void> {
  await assertReachable(coachId, athleteId)
  await db.savedProspect.upsert({ where: { coachId_athleteId: { coachId, athleteId } }, create: { coachId, athleteId }, update: {} })
}

export async function updateProspectNote(coachId: string, athleteId: string, note: string | null): Promise<boolean> {
  const result = await db.savedProspect.updateMany({ where: { coachId, athleteId }, data: { note } })
  return result.count === 1
}

export async function removeProspect(coachId: string, athleteId: string): Promise<void> {
  await db.savedProspect.deleteMany({ where: { coachId, athleteId } })
}

/** The coach's board. Profiles that are no longer public stay listed (with the note) but show nothing else. */
export async function listBoard(coachId: string, now: Date = new Date()) {
  const rows = await db.savedProspect.findMany({ where: { coachId }, orderBy: { updatedAt: 'desc' }, take: 200, select: { athleteId: true, note: true, updatedAt: true } })
  return Promise.all(
    rows.map(async (row) => {
      const visible = await isPubliclyVisible(row.athleteId)
      return { athleteId: row.athleteId, note: row.note, updatedAt: row.updatedAt.toISOString(), card: visible ? await buildProfileCard(row.athleteId, 'public', now) : null }
    }),
  )
}

/** Shown to the athlete: how many verified coaches saved their profile (never who). */
export async function savedByVerifiedCoaches(athleteId: string): Promise<number> {
  return db.savedProspect.count({ where: { athleteId, coach: { status: 'VERIFIED' } } })
}
