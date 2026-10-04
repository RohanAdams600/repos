import 'server-only'
import { z } from 'zod'
import type { Position, Prisma } from '@/generated/prisma/client'
import { Position as PositionEnum, Sport } from '@/generated/prisma/enums'
import { audit } from '@/lib/audit'
import { db } from '@/lib/db'
import { errorFields, logger } from '@/lib/logger'
import { enqueueProgramChange } from '@/lib/queue/queues'
import { sanitizeText } from '@/lib/security/sanitize'

/**
 * Program data changes that matter to recruits. Every change is recorded as a ProgramChange with
 * its source and handed to Agent 3 immediately; the worker sweep catches any enqueue that failed.
 */

export function sameCoach(a: string | null | undefined, b: string | null | undefined): boolean {
  const norm = (v: string | null | undefined) => (v ?? '').normalize('NFKD').replace(/[^\p{L}]/gu, '').toLowerCase()
  return norm(a) === norm(b)
}

const httpsUrl = z.url().max(512).refine((v) => v.startsWith('https://'), 'Use an https:// source link')
const optionalText = (max: number) =>
  z
    .string()
    .max(max)
    .transform((v) => sanitizeText(v))
    .nullable()
    .optional()

export const staffUpdateSchema = z.object({
  headCoachName: optionalText(120),
  headCoachEmail: z.email().max(254).nullable().optional(),
  headCoachSince: z.date().nullable().optional(),
  headCoachBackground: optionalText(1500),
  recentSeasonSummary: optionalText(600),
  sourceUrl: httpsUrl,
})

export type StaffUpdate = z.infer<typeof staffUpdateSchema>

async function recordChange(data: Prisma.ProgramChangeUncheckedCreateInput): Promise<string> {
  const change = await db.programChange.create({ data, select: { id: true } })
  try {
    await enqueueProgramChange(change.id)
  } catch (error) {
    logger.error({ changeId: change.id, ...errorFields(error) }, 'program change enqueue failed; sweep will retry')
  }
  return change.id
}

/** Applies a staff or feed update. Returns the change id when the head coach changed. */
export async function updateProgramStaff(programId: string, update: StaffUpdate, actorId: string | null): Promise<{ changeId: string | null }> {
  const current = await db.collegeProgram.findUniqueOrThrow({ where: { id: programId }, select: { headCoachName: true, headCoachEmail: true } })
  const name = update.headCoachName === undefined || update.headCoachName === null ? update.headCoachName : update.headCoachName.trim().replace(/\s+/g, ' ') || null
  const coachChanged = name !== undefined && name !== null && !sameCoach(current.headCoachName, name)
  // The same coach spelled differently (spacing, case) keeps the stored spelling.
  const writeName = name !== undefined && (name === null || coachChanged || !current.headCoachName)
  await db.collegeProgram.update({
    where: { id: programId },
    data: {
      ...(writeName ? { headCoachName: name } : {}),
      ...(update.headCoachEmail !== undefined ? { headCoachEmail: update.headCoachEmail } : {}),
      ...(update.headCoachSince !== undefined ? { headCoachSince: update.headCoachSince } : {}),
      ...(update.headCoachBackground !== undefined ? { headCoachBackground: update.headCoachBackground } : {}),
      ...(update.recentSeasonSummary !== undefined ? { recentSeasonSummary: update.recentSeasonSummary } : {}),
      dataSourceUrl: update.sourceUrl,
      dataVerifiedAt: new Date(),
    },
  })
  if (actorId) await audit('program.updated', { actorId, targetType: 'college_program', targetId: programId, metadata: { coachChanged } })
  if (!coachChanged) return { changeId: null }
  const changeId = await recordChange({
    collegeId: programId,
    kind: 'HEAD_COACH_CHANGED',
    previousValue: current.headCoachName ? { name: current.headCoachName } : undefined,
    newValue: { name },
    sourceUrl: update.sourceUrl,
  })
  return { changeId }
}

export const rosterNeedSchema = z.object({
  position: z.enum(PositionEnum).nullable(),
  gradYear: z.number().int().min(2000).max(2100).nullable(),
  note: z
    .string()
    .min(5)
    .max(300)
    .transform((v) => sanitizeText(v)),
  sourceUrl: httpsUrl,
  postedAt: z.date(),
  expiresAt: z.date().nullable(),
})

export async function postRosterNeed(programId: string, need: z.infer<typeof rosterNeedSchema>, actorId: string | null): Promise<{ rosterNeedId: string; changeId: string }> {
  const created = await db.rosterNeed.create({ data: { collegeId: programId, ...need }, select: { id: true } })
  if (actorId) await audit('program.roster_need_posted', { actorId, targetType: 'college_program', targetId: programId })
  const changeId = await recordChange({
    collegeId: programId,
    kind: 'ROSTER_NEED_POSTED',
    newValue: { rosterNeedId: created.id, position: need.position, gradYear: need.gradYear, note: need.note },
    sourceUrl: need.sourceUrl,
  })
  return { rosterNeedId: created.id, changeId }
}

/**
 * Licensed program data feed (PROGRAM_DATA_FEED_URL), polled daily by the worker. Only programs
 * already in the database are updated; the feed never creates schools. Shape:
 * [{ "schoolName": "...", "sport": "BASEBALL", "headCoachName": "...", "headCoachEmail": "...",
 *    "headCoachSince": "2026-07-01", "sourceUrl": "https://...", "rosterNeeds": [{ "position": "CATCHER",
 *    "gradYear": 2028, "note": "...", "postedAt": "2026-09-30" }] }]
 */
export const feedSchema = z
  .array(
    z.object({
      schoolName: z.string().min(2).max(160),
      sport: z.enum(Sport),
      headCoachName: z.string().max(120).nullable().optional(),
      headCoachEmail: z.email().max(254).nullable().optional(),
      headCoachSince: z.iso.date().nullable().optional(),
      sourceUrl: httpsUrl,
      rosterNeeds: z
        .array(z.object({ position: z.enum(PositionEnum).nullable().optional(), gradYear: z.number().int().nullable().optional(), note: z.string().min(5).max(300), postedAt: z.iso.date() }))
        .max(50)
        .optional(),
    }),
  )
  .max(5000)

export async function applyProgramFeed(records: z.infer<typeof feedSchema>): Promise<{ matched: number; coachChanges: number; rosterNeeds: number; unknownPrograms: number }> {
  let matched = 0
  let coachChanges = 0
  let rosterNeeds = 0
  let unknownPrograms = 0
  for (const record of records) {
    const program = await db.collegeProgram.findUnique({ where: { schoolName_sport: { schoolName: record.schoolName, sport: record.sport } }, select: { id: true } })
    if (!program) {
      unknownPrograms++
      continue
    }
    matched++
    const { changeId } = await updateProgramStaff(
      program.id,
      {
        ...(record.headCoachName !== undefined ? { headCoachName: record.headCoachName ? sanitizeText(record.headCoachName) : null } : {}),
        ...(record.headCoachEmail !== undefined ? { headCoachEmail: record.headCoachEmail } : {}),
        ...(record.headCoachSince !== undefined ? { headCoachSince: record.headCoachSince ? new Date(`${record.headCoachSince}T00:00:00Z`) : null } : {}),
        sourceUrl: record.sourceUrl,
      },
      null,
    )
    if (changeId) coachChanges++
    for (const need of record.rosterNeeds ?? []) {
      const postedAt = new Date(`${need.postedAt}T00:00:00Z`)
      const exists = await db.rosterNeed.findFirst({ where: { collegeId: program.id, note: sanitizeText(need.note), postedAt }, select: { id: true } })
      if (exists) continue
      await postRosterNeed(program.id, { position: (need.position ?? null) as Position | null, gradYear: need.gradYear ?? null, note: sanitizeText(need.note), sourceUrl: record.sourceUrl, postedAt, expiresAt: null }, null)
      rosterNeeds++
    }
  }
  return { matched, coachChanges, rosterNeeds, unknownPrograms }
}
