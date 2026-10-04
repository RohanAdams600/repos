import { createHash, randomUUID } from 'node:crypto'
import { TRPCError } from '@trpc/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Prisma } from '@/generated/prisma/client'
import { buildAccountExport } from '@/lib/account/export'
import { scheduleDeletion } from '@/lib/account/deletion'
import { BudgetExceededError } from '@/lib/ai/budget'
import { LlmOutputError, type LlmClient } from '@/lib/ai/llm'
import type { SessionUser } from '@/lib/auth/permissions'
import { clearLocalCache } from '@/lib/cache'
import { db } from '@/lib/db'
import { rankInCohort } from '@/lib/insights/build-cohort'
import { athleteBiometrics, athleteProjections, biometricPercentile } from '@/lib/insights/service'
import { buildProfileCard, findPublicAthlete, profileStats, recordProfileEvent, rotateProfileSlug, setProfileVisibility } from '@/lib/profile/public'
import { processDraftForAthlete, processProgramChange } from '@/lib/recruiting/assistant'
import { applyProgramFeed, postRosterNeed, updateProgramStaff } from '@/lib/recruiting/changes'
import type { OutreachFacts } from '@/lib/recruiting/draft-check'
import { runEvidenceChecks, type EvidenceStorage } from '@/lib/verification/run-checks'
import { createEvidenceUpload, decideEvidence, purgeEvidence, VerificationError } from '@/lib/verification/service'
import { appRouter } from '@/server/routers/_app'
import { GET as publicPdf } from '@/app/p/[slug]/pdf/route'
import { createAthlete, resetDb } from '../helpers/db'
import { syntheticMp4 } from '../helpers/mp4'

vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'x-forwarded-for': '203.0.113.9', 'user-agent': 'Mozilla/5.0 (Macintosh) Safari/605' }),
  cookies: async () => ({ get: () => undefined, getAll: () => [] }),
}))

const deleted: string[] = []
vi.mock('@/lib/storage/gcs', () => ({
  createSignedUpload: async (key: string) => ({ url: `https://storage.test/${key}`, headers: {}, expiresAt: new Date().toISOString() }),
  createSignedPlaybackUrl: async (key: string) => `https://storage.test/play/${key}`,
  deleteObject: async (key: string) => void deleted.push(key),
  deletePrefix: async () => undefined,
  getObjectInfo: async () => ({ exists: true, sizeBytes: 1000, contentType: 'video/mp4' }),
  readObjectHead: async () => syntheticMp4().slice(0, 64),
  readObjectRange: async () => new Uint8Array(0),
  objectSha256: async () => 'x'.repeat(64),
  gcsUri: (key: string) => `gs://test/${key}`,
}))

const DAY = 86_400_000

beforeEach(async () => {
  await resetDb()
  clearLocalCache()
  deleted.length = 0
})

async function createMinor(consent: 'PENDING' | 'GRANTED' | 'REVOKED'): Promise<SessionUser> {
  const user = await createAthlete()
  await db.user.update({
    where: { id: user.id },
    data: {
      dateOfBirth: new Date(Date.UTC(new Date().getUTCFullYear() - 15, 0, 1)),
      guardianConsent: { create: { guardianEmail: `parent-${user.id.slice(0, 8)}@example.test`, tokenHash: createHash('sha256').update(randomUUID()).digest('hex'), status: consent, expiresAt: new Date(Date.now() + DAY) } },
    },
  })
  return { ...user, ageBand: 'MINOR', guardianConsent: consent }
}

describe('public profiles', () => {
  it('publishes only with consent and shows optional fields only when chosen', async () => {
    const minor = await createMinor('PENDING')
    expect(await setProfileVisibility(minor, { isPublic: true, showGpa: true, showSchool: true })).toEqual({ ok: false, reason: 'consent-required' })

    const adult = await createAthlete()
    await db.athleteProfile.update({ where: { userId: adult.id }, data: { gpa: 3.9, highSchool: 'Lincoln High School' } })
    const result = await setProfileVisibility(adult, { isPublic: true, showGpa: false, showSchool: true })
    expect(result.ok).toBe(true)
    const slug = (result as { slug: string }).slug
    expect(slug).toMatch(/^test-[a-z2-9]{8}$/)
    expect(await findPublicAthlete(slug)).toBe(adult.id)

    const publicCard = await buildProfileCard(adult.id, 'public')
    expect(publicCard).toMatchObject({ gpa: null, highSchool: 'Lincoln High School' })
    expect((await buildProfileCard(adult.id, 'owner'))?.gpa).toBe(3.9)

    const fresh = await rotateProfileSlug(adult.id)
    expect(await findPublicAthlete(slug)).toBeNull()
    expect(await findPublicAthlete(fresh)).toBe(adult.id)

    await scheduleDeletion(adult.id, 'USER')
    expect(await findPublicAthlete(fresh)).toBeNull()
  })

  it('re-checks guardian consent when the link is opened', async () => {
    const minor = await createMinor('GRANTED')
    const result = await setProfileVisibility(minor, { isPublic: true, showGpa: false, showSchool: false })
    const slug = (result as { slug: string }).slug
    expect(await findPublicAthlete(slug)).toBe(minor.id)
    // Even if the public flag were left on, withdrawn consent hides the profile.
    await db.guardianConsent.update({ where: { userId: minor.id }, data: { status: 'REVOKED' } })
    expect(await findPublicAthlete(slug)).toBeNull()
  })

  it('shows a Verified badge only when the best value itself was verified', async () => {
    const athlete = await createAthlete()
    const date = new Date()
    await db.metric.createMany({
      data: [
        { athleteId: athlete.id, metricType: 'EXIT_VELOCITY', value: 90, date, verified: true },
        { athleteId: athlete.id, metricType: 'EXIT_VELOCITY', value: 92, date, verified: false },
      ],
    })
    let metric = (await buildProfileCard(athlete.id, 'public'))!.metrics[0]!
    expect(metric).toMatchObject({ best: 92, bestVerified: false, verifiedBest: 90 })

    await db.metric.create({ data: { athleteId: athlete.id, metricType: 'EXIT_VELOCITY', value: 92, date, verified: true } })
    metric = (await buildProfileCard(athlete.id, 'public'))!.metrics[0]!
    expect(metric).toMatchObject({ best: 92, bestVerified: true, verifiedBest: null })
  })

  it('counts views and downloads as daily totals and serves the PDF only for public profiles', async () => {
    const athlete = await createAthlete()
    await recordProfileEvent(athlete.id, 'view')
    await recordProfileEvent(athlete.id, 'view')
    await recordProfileEvent(athlete.id, 'pdf')
    expect(await profileStats(athlete.id)).toEqual({ views: 2, pdfDownloads: 1 })

    const { slug } = (await setProfileVisibility(athlete, { isPublic: true, showGpa: false, showSchool: false })) as { slug: string }
    const response = await publicPdf(new Request(`http://localhost:3000/p/${slug}/pdf`, { headers: { 'user-agent': 'Mozilla/5.0 Safari' } }), { params: Promise.resolve({ slug }) })
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('application/pdf')
    expect(new TextDecoder().decode((await response.arrayBuffer()).slice(0, 5))).toBe('%PDF-')
    expect((await profileStats(athlete.id)).pdfDownloads).toBe(2)

    await setProfileVisibility(athlete, { isPublic: false, showGpa: false, showSchool: false })
    const hidden = await publicPdf(new Request(`http://localhost:3000/p/${slug}/pdf`), { params: Promise.resolve({ slug }) })
    expect(hidden.status).toBe(404)
  })
})

function memoryStorage(files: Record<string, Uint8Array>): EvidenceStorage & { removed: string[] } {
  const removed: string[] = []
  return {
    removed,
    info: async (key) => ({ exists: key in files, sizeBytes: files[key]?.length ?? 0 }),
    readRange: async (key, start, length) => files[key]!.slice(start, start + length),
    sha256: async (key) => createHash('sha256').update(files[key]!).digest('hex'),
    remove: async (key) => {
      removed.push(key)
      delete files[key]
    },
  }
}

async function metricWithEvidence(athleteId: string, status: 'CHECKING' | 'IN_REVIEW', extra: Partial<Prisma.MetricVerificationUncheckedCreateInput> = {}) {
  const metric = await db.metric.create({ data: { athleteId, metricType: 'PITCH_VELO', value: 84.5, date: new Date('2026-09-29T00:00:00Z') }, select: { id: true } })
  const objectKey = `videos/${athleteId}/evidence/${metric.id}.mp4`
  await db.metricVerification.create({ data: { metricId: metric.id, athleteId, status, objectKey, contentType: 'video/mp4', sizeBytes: 1000, ...extra } })
  return { metricId: metric.id, objectKey }
}

describe('metric verification', () => {
  it('moves plausible evidence to review with the automatic check results', async () => {
    const athlete = await createAthlete()
    const { metricId, objectKey } = await metricWithEvidence(athlete.id, 'CHECKING')
    const storage = memoryStorage({ [objectKey]: syntheticMp4({ createdAt: new Date('2026-09-30T17:00:00Z'), durationSec: 9 }) })
    expect(await runEvidenceChecks(metricId, storage, new Date('2026-10-04T00:00:00Z'))).toBe('IN_REVIEW')
    const row = await db.metricVerification.findUniqueOrThrow({ where: { metricId } })
    expect(row).toMatchObject({ status: 'IN_REVIEW', durationMs: 9000 })
    expect(row.sha256).toMatch(/^[0-9a-f]{64}$/)
    expect(row.checks).toMatchObject({ recordedDate: 'matches', reuse: 'none' })
    expect(await runEvidenceChecks(metricId, storage)).toBe('SKIPPED')
  })

  it('rejects a clip another athlete already submitted and deletes it at once', async () => {
    const first = await createAthlete()
    const second = await createAthlete()
    const bytes = syntheticMp4({ durationSec: 5 })
    const sha = createHash('sha256').update(bytes).digest('hex')
    await metricWithEvidence(first.id, 'IN_REVIEW', { sha256: sha })
    const { metricId, objectKey } = await metricWithEvidence(second.id, 'CHECKING')
    const storage = memoryStorage({ [objectKey]: bytes })
    expect(await runEvidenceChecks(metricId, storage)).toBe('REJECTED')
    expect(storage.removed).toEqual([objectKey])
    const row = await db.metricVerification.findUniqueOrThrow({ where: { metricId } })
    expect(row).toMatchObject({ status: 'REJECTED', rejectionReason: 'DUPLICATE_VIDEO', objectKey: null })
    expect(await db.notification.count({ where: { userId: second.id, kind: 'METRIC_REJECTED' } })).toBe(1)
  })

  it('records one reviewer decision, sets the badge and notifies the athlete', async () => {
    const athlete = await createAthlete()
    const admin = await createAthlete()
    const { metricId, objectKey } = await metricWithEvidence(athlete.id, 'IN_REVIEW')
    expect(await decideEvidence(admin.id, metricId, { approve: true })).toBe(true)
    expect(await decideEvidence(admin.id, metricId, { approve: false, reason: 'OTHER' })).toBe(false)
    const metric = await db.metric.findUniqueOrThrow({ where: { id: metricId } })
    expect(metric).toMatchObject({ verified: true, videoUrl: objectKey })
    expect(await db.notification.count({ where: { userId: athlete.id, kind: 'METRIC_VERIFIED' } })).toBe(1)

    const other = await metricWithEvidence(athlete.id, 'IN_REVIEW')
    expect(await decideEvidence(admin.id, other.metricId, { approve: false, reason: 'VALUE_NOT_VISIBLE', note: 'Radar display is out of frame.' })).toBe(true)
    expect(await db.metric.findUniqueOrThrow({ where: { id: other.metricId } })).toMatchObject({ verified: false })
    expect(await db.metricVerification.findUniqueOrThrow({ where: { metricId: other.metricId } })).toMatchObject({ status: 'REJECTED', rejectionReason: 'VALUE_NOT_VISIBLE', reviewerNote: 'Radar display is out of frame.' })
  })

  it('deletes evidence clips 30 days after the decision and clears the video link', async () => {
    const athlete = await createAthlete()
    const now = new Date()
    const { metricId, objectKey } = await metricWithEvidence(athlete.id, 'IN_REVIEW')
    await db.metricVerification.update({ where: { metricId }, data: { status: 'VERIFIED', reviewedAt: new Date(now.getTime() - 31 * DAY) } })
    await db.metric.update({ where: { id: metricId }, data: { verified: true, videoUrl: objectKey } })
    expect(await purgeEvidence(now)).toEqual({ purged: 1, abandoned: 0 })
    expect(deleted).toContain(objectKey)
    expect(await db.metricVerification.findUniqueOrThrow({ where: { metricId } })).toMatchObject({ objectKey: null, status: 'VERIFIED' })
    expect(await db.metric.findUniqueOrThrow({ where: { id: metricId } })).toMatchObject({ verified: true, videoUrl: null })
  })

  it('enforces ownership and the monthly request limit', async () => {
    const athlete = await createAthlete()
    const stranger = await createAthlete()
    const metric = await db.metric.create({ data: { athleteId: athlete.id, metricType: 'PITCH_VELO', value: 80, date: new Date() }, select: { id: true } })
    await expect(createEvidenceUpload(stranger, { metricId: metric.id, contentType: 'video/mp4', sizeBytes: 1000 })).rejects.toMatchObject({ code: 'NOT_FOUND' })
    const created = await createEvidenceUpload(athlete, { metricId: metric.id, contentType: 'video/mp4', sizeBytes: 1000 })
    expect(created.upload.url).toContain(`videos/${athlete.id}/evidence/${metric.id}-`)

    for (let i = 0; i < 10; i++) await metricWithEvidence(athlete.id, 'IN_REVIEW')
    const another = await db.metric.create({ data: { athleteId: athlete.id, metricType: 'PITCH_VELO', value: 81, date: new Date() }, select: { id: true } })
    await expect(createEvidenceUpload(athlete, { metricId: another.id, contentType: 'video/mp4', sizeBytes: 1000 })).rejects.toBeInstanceOf(VerificationError)
  })
})

describe('biometric percentiles', () => {
  async function athleteWithBuild(age: number, heightInches: number, weightLbs: number, exitVelo: number) {
    const a = await createAthlete()
    const now = new Date()
    await db.user.update({ where: { id: a.id }, data: { dateOfBirth: new Date(Date.UTC(now.getUTCFullYear() - age, now.getUTCMonth() - 2, 1)) } })
    await db.athleteProfile.update({ where: { userId: a.id }, data: { heightInches, weightLbs } })
    await db.metric.create({ data: { athleteId: a.id, metricType: 'EXIT_VELOCITY', value: exitVelo, date: now } })
    return a
  }

  it('ranks within the narrowest cohort of at least 25 and never against the athlete themselves', async () => {
    const values = Array.from({ length: 30 }, (_, i) => 70 + i)
    const athletes = []
    for (const v of values) athletes.push(await athleteWithBuild(16, 72, 180, v))
    const result = await biometricPercentile({ metricType: 'EXIT_VELOCITY', value: 95, age: 16, heightInches: 72, weightLbs: 180 })
    expect(result).toMatchObject({ status: 'ok', cohortSize: 30, percentile: rankInCohort(95, values, true) })
    expect((result as { bands: { level: number } }).bands.level).toBe(0)

    const own = await athleteBiometrics(athletes[0]!.id)
    expect(own.status).toBe('ok')
    expect((own as { results: { cohortSize?: number }[] }).results[0]!.cohortSize).toBe(29)
  })

  it('widens the build range when needed and refuses to rank against too few athletes', async () => {
    for (let i = 0; i < 10; i++) await athleteWithBuild(16, 72, 180, 80 + i)
    for (let i = 0; i < 20; i++) await athleteWithBuild(16, 75, 200, 80 + i)
    const widened = await biometricPercentile({ metricType: 'EXIT_VELOCITY', value: 85, age: 16, heightInches: 72, weightLbs: 180 })
    expect(widened).toMatchObject({ status: 'ok', cohortSize: 30 })
    expect((widened as { bands: { level: number } }).bands.level).toBe(2)

    clearLocalCache()
    const none = await biometricPercentile({ metricType: 'PITCH_VELO', value: 80, age: 16, heightInches: 72, weightLbs: 180 })
    expect(none).toEqual({ status: 'insufficient', metricType: 'PITCH_VELO', value: 80, largestCohort: 0 })
  })

  it('asks for height and weight before ranking by build', async () => {
    const a = await createAthlete()
    expect(await athleteBiometrics(a.id)).toEqual({ status: 'needs-build', missing: ['height', 'weight'] })
  })
})

describe('cross-sport projections', () => {
  it('reads the athlete’s standing into other sports, preferring their class cohort', async () => {
    const a = await createAthlete({ gradYear: 2027 })
    await db.metric.create({ data: { athleteId: a.id, metricType: 'SIXTY_YARD_DASH', value: 6.8, date: new Date() } })
    const computedFor = new Date(Date.now() - 3 * DAY)
    const row = (metricType: 'SIXTY_YARD_DASH' | 'FORTY_YARD_DASH', gradYear: number | null, q: number[]) => ({
      computedFor,
      cohortKey: `${metricType}|${gradYear ?? '*'}|*`,
      metricType,
      gradYear,
      sampleSize: 40,
      p10: q[0]!,
      p25: q[1]!,
      p50: q[2]!,
      p75: q[3]!,
      p90: q[4]!,
      mean: q[2]!,
      stddev: 0.3,
    })
    await db.percentileBaseline.createMany({
      data: [row('SIXTY_YARD_DASH', 2027, [6.6, 6.8, 7.0, 7.3, 7.6]), row('FORTY_YARD_DASH', null, [4.5, 4.7, 4.9, 5.1, 5.3])],
    })
    const projections = await athleteProjections(a.id)
    expect(projections).toHaveLength(1)
    expect(projections[0]).toMatchObject({ target: 'FORTY_YARD_DASH', trait: 'SPEED', standing: 75, value: 4.7, bound: 'exact', scope: 'all-classes' })
  })
})

function fakeLlm(write: (facts: OutreachFacts) => { subject: string; body: string } | Error): LlmClient {
  return {
    async generateJson(request) {
      const facts = JSON.parse(request.user.slice(request.user.indexOf('{'))) as OutreachFacts
      const draft = write(facts)
      if (draft instanceof Error) throw draft
      const checked = request.validator.safeParse(draft)
      if (!checked.success) throw new LlmOutputError(checked.error.issues[0]?.message ?? 'invalid')
      return { data: checked.data, model: 'fake-model', inputTokens: 10, outputTokens: 10 }
    },
  }
}

const honestDraft = (facts: OutreachFacts) => ({
  subject: `${facts.athlete.position}, class of ${facts.athlete.gradYear}`,
  body: `Coach ${facts.program.headCoachName?.split(' ').pop() ?? ''}, congratulations on your new role at ${facts.program.school}. I am ${facts.athlete.name}, a ${facts.athlete.position.toLowerCase()} in the class of ${facts.athlete.gradYear}. I would be grateful to know how best to share more information. ${facts.athlete.name}`,
})

describe('Agent 3: recruiting assistant', () => {
  async function program() {
    return db.collegeProgram.create({ data: { schoolName: 'Test State University', division: 'D1', averageRecruitingMetrics: {}, headCoachName: 'Old Coach', headCoachEmail: 'coach@state.example' }, select: { id: true } })
  }
  async function watcher(collegeId: string, options: { tier?: 'FREE' | 'PRO'; alerts?: boolean; position?: 'SHORTSTOP' | 'CATCHER' } = {}) {
    const a = await createAthlete({ tier: options.tier ?? 'PRO', position: options.position })
    await db.athleteProfile.update({ where: { userId: a.id }, data: { recruitingAlerts: options.alerts ?? true } })
    await db.recruitingPipeline.create({ data: { athleteId: a.id, collegeId } })
    return a
  }

  it('records a coaching change once and alerts only eligible watchers', async () => {
    const { id: collegeId } = await program()
    const pro = await watcher(collegeId)
    await watcher(collegeId, { tier: 'FREE' })
    await watcher(collegeId, { alerts: false })
    const minor = await createMinor('PENDING')
    await db.user.update({ where: { id: minor.id }, data: { subscriptionTier: 'PRO' } })
    await db.athleteProfile.update({ where: { userId: minor.id }, data: { recruitingAlerts: true } })
    await db.recruitingPipeline.create({ data: { athleteId: minor.id, collegeId } })

    const { changeId } = await updateProgramStaff(collegeId, { headCoachName: 'Jordan Lee', sourceUrl: 'https://state.example/news/coach' }, null)
    expect(changeId).not.toBeNull()
    expect((await updateProgramStaff(collegeId, { headCoachName: '  jordan  LEE ', sourceUrl: 'https://state.example/news/coach' }, null)).changeId).toBeNull()

    const enqueued: string[] = []
    expect(await processProgramChange(changeId!, async (_c, athleteId) => void enqueued.push(athleteId))).toEqual({ watchers: 1 })
    expect(enqueued).toEqual([pro.id])
    expect(await processProgramChange(changeId!, async () => undefined)).toEqual({ watchers: 0 })

    expect(await processDraftForAthlete(fakeLlm(honestDraft), changeId!, pro.id, { finalAttempt: false })).toBe('drafted')
    const draft = await db.outreachDraft.findFirstOrThrow({ where: { athleteId: pro.id } })
    expect(draft).toMatchObject({ trigger: 'COACH_CHANGE', channel: 'EMAIL', model: 'fake-model', changeId })
    expect(draft.body).toContain('Coach Lee')
    // A retried job neither drafts nor notifies twice.
    expect(await processDraftForAthlete(fakeLlm(honestDraft), changeId!, pro.id, { finalAttempt: false })).toBe('drafted')
    expect(await db.outreachDraft.count({ where: { athleteId: pro.id } })).toBe(1)
    expect(await db.notification.count({ where: { userId: pro.id, kind: 'COACH_CHANGE' } })).toBe(1)

    const exported = await buildAccountExport(pro.id)
    expect(exported.outreachDrafts).toHaveLength(1)
    expect(exported.notifications).toHaveLength(1)
  })

  it('never stores a draft with invented numbers, and still alerts when drafting is impossible', async () => {
    const { id: collegeId } = await program()
    const pro = await watcher(collegeId)
    const { changeId } = await updateProgramStaff(collegeId, { headCoachName: 'Jordan Lee', sourceUrl: 'https://state.example/news' }, null)
    const invented = fakeLlm((facts) => ({ ...honestDraft(facts), body: `${honestDraft(facts).body} I hit 99 mph.` }))
    await expect(processDraftForAthlete(invented, changeId!, pro.id, { finalAttempt: false })).rejects.toBeInstanceOf(LlmOutputError)
    expect(await db.outreachDraft.count()).toBe(0)

    expect(await processDraftForAthlete(fakeLlm(() => new BudgetExceededError('user')), changeId!, pro.id, { finalAttempt: false })).toBe('alerted-without-draft')
    expect(await db.notification.count({ where: { userId: pro.id } })).toBe(1)
  })

  it('sends roster needs only to athletes at the posted position', async () => {
    const { id: collegeId } = await program()
    const catcher = await watcher(collegeId, { position: 'CATCHER' })
    await watcher(collegeId, { position: 'SHORTSTOP' })
    const { changeId } = await postRosterNeed(collegeId, { position: 'CATCHER', gradYear: null, note: 'Looking for a catcher for the fall', sourceUrl: 'https://state.example/needs', postedAt: new Date(), expiresAt: null }, null)
    const enqueued: string[] = []
    await processProgramChange(changeId, async (_c, athleteId) => void enqueued.push(athleteId))
    expect(enqueued).toEqual([catcher.id])
  })

  it('applies the licensed feed to known programs only and does not repeat roster needs', async () => {
    const { id: collegeId } = await program()
    const feed = [
      { schoolName: 'Test State University', sport: 'BASEBALL' as const, headCoachName: 'Jordan Lee', sourceUrl: 'https://feed.example/a', rosterNeeds: [{ position: 'CATCHER' as const, note: 'Catcher for 2028', postedAt: '2026-09-30' }] },
      { schoolName: 'Unknown College', sport: 'BASEBALL' as const, headCoachName: 'Someone', sourceUrl: 'https://feed.example/b' },
    ]
    expect(await applyProgramFeed(feed)).toEqual({ matched: 1, coachChanges: 1, rosterNeeds: 1, unknownPrograms: 1 })
    expect(await applyProgramFeed(feed)).toEqual({ matched: 1, coachChanges: 0, rosterNeeds: 0, unknownPrograms: 1 })
    expect(await db.programChange.count({ where: { collegeId } })).toBe(2)
    expect(await db.collegeProgram.count()).toBe(1)
  })

  it('keeps the assistant behind Pro and pipeline membership', async () => {
    const { id: collegeId } = await program()
    const free = await createAthlete()
    const caller = (user: SessionUser) => appRouter.createCaller({ user, ipHash: 'test' })
    await expect(caller(free).recruiting.overview()).rejects.toSatisfy((e: unknown) => e instanceof TRPCError && e.code === 'FORBIDDEN')
    const pro = await createAthlete({ tier: 'PRO' })
    await expect(caller(pro).recruiting.draft({ collegeId, channel: 'EMAIL' })).rejects.toSatisfy((e: unknown) => e instanceof TRPCError && e.code === 'NOT_FOUND')
    await db.recruitingPipeline.create({ data: { athleteId: pro.id, collegeId } })
    const overview = await caller(pro).recruiting.overview()
    expect(overview.programs.map((p) => p.schoolName)).toEqual(['Test State University'])
  })
})

describe('side-by-side comparisons', () => {
  const report = (footStrikeTime: number | null) =>
    ({ algorithm: 'kseq-2d-v1', motionType: 'SWING', handedness: 'RIGHT', frameRate: 30, durationSec: 3, footStrikeTime, peaks: [], observedOrder: [], sequenceIsIdeal: true, gapsMs: { pelvisToTorso: 0, torsoToArm: 0, armToHand: 0 }, separationAtFootStrikeDeg: null, maxSeparationDeg: 0, findings: [], warnings: [], confidence: 1 }) as unknown as Prisma.InputJsonValue
  const pose = { v: 1, aspectRatio: 1.7778, rows: [] } as Prisma.InputJsonValue

  async function analysis(athleteId: string, footStrikeTime: number | null = 1) {
    return db.videoAnalysis.create({ data: { athleteId, motionType: 'SWING', handedness: 'RIGHT', status: 'COMPLETE', objectKey: `videos/${athleteId}/${randomUUID()}.mp4`, contentType: 'video/mp4', sizeBytes: 100, report: report(footStrikeTime), poseData: pose }, select: { id: true } })
  }
  async function clip(overrides: Partial<Prisma.ReferenceClipCreateInput>) {
    return db.referenceClip.create({
      data: { title: 'Swing', playerName: 'Licensed Pro', level: 'MLB', motionType: 'SWING', handedness: 'LEFT', status: 'READY', active: true, objectKey: `reference/${randomUUID()}.mp4`, contentType: 'video/mp4', sizeBytes: 100, report: report(1.2), poseData: pose, licensor: 'Rights Holder LLC', licenseReference: 'LIC-001', attribution: 'Footage licensed from Rights Holder LLC', ...overrides },
      select: { id: true },
    })
  }

  it('offers only licensed, active, processed clips and the athlete’s own synced clips', async () => {
    const athlete = await createAthlete({ tier: 'PRO' })
    const a = await analysis(athlete.id)
    const b = await analysis(athlete.id)
    // No foot strike (common on skates): still comparable, synced on peak hand speed.
    const c = await analysis(athlete.id, null)
    const valid = await clip({})
    await clip({ licenseExpiresAt: new Date(Date.now() - DAY) })
    await clip({ active: false })
    await clip({ status: 'PROCESSING' })
    const caller = appRouter.createCaller({ user: athlete, ipHash: 'test' })
    const options = await caller.analysis.compareOptions({ analysisId: a.id })
    expect(options.syncable).toBe(true)
    expect(options.own.map((o) => o.id).sort()).toEqual([b.id, c.id].sort())
    expect(options.references.map((r) => r.id)).toEqual([valid.id])

    const comparison = await caller.analysis.comparison({ analysisId: a.id, other: { kind: 'reference', id: valid.id } })
    expect(comparison.b).toMatchObject({ label: 'Licensed Pro (MLB)', attribution: 'Footage licensed from Rights Holder LLC', handedness: 'LEFT' })
    expect(comparison.a.videoUrl).toContain('https://storage.test/play/')
  })

  it('accepts only motions that belong to the athlete’s sport', async () => {
    const athlete = await createAthlete({ tier: 'PRO' })
    const caller = appRouter.createCaller({ user: athlete, ipHash: 'test' })
    const upload = { handedness: 'LEFT' as const, contentType: 'video/mp4', sizeBytes: 1000, durationMs: 4000, width: 1080, height: 1920 }
    await expect(caller.analysis.createUpload({ ...upload, motionType: 'HOCKEY_SHOT' })).rejects.toSatisfy((e: unknown) => e instanceof TRPCError && e.code === 'BAD_REQUEST')
    await db.athleteProfile.update({ where: { userId: athlete.id }, data: { sport: 'HOCKEY', primaryPosition: 'CENTER' } })
    const created = await caller.analysis.createUpload({ ...upload, motionType: 'HOCKEY_SHOT' })
    expect(created.upload.url).toContain(`videos/${athlete.id}/`)
  })

  it('refuses expired licences and other athletes’ clips', async () => {
    const athlete = await createAthlete({ tier: 'PRO' })
    const stranger = await createAthlete({ tier: 'PRO' })
    const a = await analysis(athlete.id)
    const theirs = await analysis(stranger.id)
    const expired = await clip({ licenseExpiresAt: new Date(Date.now() - 1000) })
    const caller = appRouter.createCaller({ user: athlete, ipHash: 'test' })
    const notFound = (e: unknown) => e instanceof TRPCError && e.code === 'NOT_FOUND'
    await expect(caller.analysis.comparison({ analysisId: a.id, other: { kind: 'reference', id: expired.id } })).rejects.toSatisfy(notFound)
    await expect(caller.analysis.comparison({ analysisId: a.id, other: { kind: 'own', id: theirs.id } })).rejects.toSatisfy(notFound)
    await expect(caller.analysis.compareOptions({ analysisId: theirs.id })).rejects.toSatisfy(notFound)
  })
})
