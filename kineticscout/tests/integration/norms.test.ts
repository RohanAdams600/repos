import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionUser } from '@/lib/auth/permissions'
import { clearLocalCache } from '@/lib/cache'
import { db } from '@/lib/db'
import { env } from '@/lib/env'
import { activateNormDataset, deleteDraftNormDataset, importNormDataset, NormAdminError, retireNormDataset, type NormDatasetMeta } from '@/lib/insights/norm-admin'
import { nationalPercentile } from '@/lib/insights/national'
import { NORM_CSV_COLUMNS } from '@/lib/insights/norms'
import { athleteBiometrics, athleteProjections } from '@/lib/insights/service'
import { createAthlete, resetDb } from '../helpers/db'

let sessionUser: SessionUser | null = null
vi.mock('@/lib/auth/session', () => ({ getSessionUser: async () => sessionUser }))

const { POST } = await import('@/app/api/admin/norms/route')

beforeEach(async () => {
  await resetDb()
  clearLocalCache()
  sessionUser = null
})

const HEADER = NORM_CSV_COLUMNS.join(',')
const meta = (edition: string, extra: Partial<NormDatasetMeta> = {}): NormDatasetMeta => ({
  name: 'Showcase Norms',
  publisher: 'Example Testing Body',
  edition,
  population: 'High school athletes measured at test events, as published.',
  sourceUrl: 'https://example.org/norms',
  licence: 'Test licence covering display to users.',
  licenceExpiresAt: '',
  licenceConfirmed: 'on',
  ...extra,
})
const build = { age: 16, heightInches: 72, weightLbs: 180 }

async function admin(): Promise<SessionUser> {
  const athlete = await createAthlete()
  await db.user.update({ where: { id: athlete.id }, data: { role: 'ADMIN' } })
  return { ...athlete, role: 'ADMIN' }
}

describe('national norm tables', () => {
  it('stores a valid table as a draft that no athlete sees until it is activated', async () => {
    const staff = await admin()
    const result = await importNormDataset(staff.id, meta('2026'), `${HEADER}\nEXIT_VELOCITY,15,16,,,,,1200,70,76,81,86,90`)
    expect(result).toMatchObject({ ok: true, rowCount: 1, metrics: ['EXIT_VELOCITY'] })
    if (!result.ok) return
    expect(await nationalPercentile({ metricType: 'EXIT_VELOCITY', value: 81, ...build })).toBeNull()

    await activateNormDataset(staff.id, result.datasetId)
    expect(await nationalPercentile({ metricType: 'EXIT_VELOCITY', value: 81, ...build })).toMatchObject({
      percentile: 50,
      sampleSize: 1200,
      bandLabel: 'ages 15 to 16',
      source: { publisher: 'Example Testing Body', edition: '2026' },
    })
    await expect(deleteDraftNormDataset(staff.id, result.datasetId)).rejects.toBeInstanceOf(NormAdminError)
    expect(await db.auditLog.count({ where: { action: { in: ['norms.imported', 'norms.activated'] } } })).toBe(2)
  })

  it('refuses a bad table, a duplicate edition and an expired licence without storing anything', async () => {
    const staff = await admin()
    const bad = await importNormDataset(staff.id, meta('2026'), `${HEADER}\nEXIT_VELOCITY,15,16,,,,,10,70,76,81,86,90`)
    expect(bad).toMatchObject({ ok: false, issues: [{ line: 2 }] })
    expect(await db.normDataset.count()).toBe(0)

    await importNormDataset(staff.id, meta('2026'), `${HEADER}\nEXIT_VELOCITY,15,16,,,,,100,70,76,81,86,90`)
    expect(await importNormDataset(staff.id, meta('2026'), `${HEADER}\nEXIT_VELOCITY,15,16,,,,,100,70,76,81,86,90`)).toMatchObject({ ok: false, fieldErrors: { edition: expect.stringMatching(/already exists/) } })
    expect(await importNormDataset(staff.id, meta('2025', { licenceExpiresAt: '2020-01-01' }), `${HEADER}\nEXIT_VELOCITY,15,16,,,,,100,70,76,81,86,90`)).toMatchObject({ ok: false, fieldErrors: { licenceExpiresAt: expect.any(String) } })
  })

  it('prefers the most recently activated edition, falls back when it is retired, and drops expired licences', async () => {
    const staff = await admin()
    const older = await importNormDataset(staff.id, meta('2025'), `${HEADER}\nEXIT_VELOCITY,15,16,,,,,1000,60,66,71,76,80`)
    const newer = await importNormDataset(staff.id, meta('2026'), `${HEADER}\nEXIT_VELOCITY,15,16,,,,,1500,70,76,81,86,90`)
    if (!older.ok || !newer.ok) throw new Error('import failed')
    await activateNormDataset(staff.id, older.datasetId, new Date(Date.now() - 60_000))
    await activateNormDataset(staff.id, newer.datasetId)
    expect((await nationalPercentile({ metricType: 'EXIT_VELOCITY', value: 81, ...build }))?.source.edition).toBe('2026')

    await retireNormDataset(staff.id, newer.datasetId)
    expect((await nationalPercentile({ metricType: 'EXIT_VELOCITY', value: 81, ...build }))?.source.edition).toBe('2025')

    // The licence ended yesterday: the table is ignored from today, without anyone retiring it.
    await db.normDataset.update({ where: { id: older.datasetId }, data: { licenceExpiresAt: new Date(Date.now() - 86_400_000) } })
    clearLocalCache()
    expect(await nationalPercentile({ metricType: 'EXIT_VELOCITY', value: 81, ...build })).toBeNull()
  })

  it('keeps rows immutable and enforces the sample floor in the database', async () => {
    const staff = await admin()
    const result = await importNormDataset(staff.id, meta('2026'), `${HEADER}\nEXIT_VELOCITY,15,16,,,,,1200,70,76,81,86,90`)
    if (!result.ok) throw new Error('import failed')
    await expect(db.normRow.updateMany({ where: { datasetId: result.datasetId }, data: { sampleSize: 5000 } })).rejects.toThrow(/immutable/)
    await expect(db.normRow.create({ data: { datasetId: result.datasetId, metricType: 'PITCH_VELO', sampleSize: 10, p10: 1, p25: 2, p50: 3, p75: 4, p90: 5 } })).rejects.toThrow()
    await expect(db.normDataset.update({ where: { id: result.datasetId }, data: { status: 'ACTIVE' } })).rejects.toThrow()
  })
})

describe('national figures for athletes', () => {
  async function athlete(metricType: 'EXIT_VELOCITY' | 'FORTY_YARD_DASH', value: number) {
    const a = await createAthlete()
    const now = new Date()
    await db.user.update({ where: { id: a.id }, data: { dateOfBirth: new Date(Date.UTC(now.getUTCFullYear() - 16, now.getUTCMonth(), now.getUTCDate() - 10)) } })
    await db.athleteProfile.update({ where: { userId: a.id }, data: { heightInches: 72, weightLbs: 180 } })
    await db.metric.create({ data: { athleteId: a.id, metricType, value, date: now } })
    return a
  }

  it('adds the national standing beside the KineticScout cohort on the insights page', async () => {
    const staff = await admin()
    const a = await athlete('EXIT_VELOCITY', 86)
    const result = await importNormDataset(staff.id, meta('2026'), `${HEADER}\nEXIT_VELOCITY,15,16,70,73,,,410,72,78,83,86,92`)
    if (!result.ok) throw new Error('import failed')
    await activateNormDataset(staff.id, result.datasetId)
    const insights = await athleteBiometrics(a.id)
    if (insights.status !== 'ok') throw new Error('expected insights')
    expect(insights.results[0]).toMatchObject({ status: 'insufficient', national: { percentile: 75, bandLabel: 'ages 15 to 16, 70 to 73 in', sampleSize: 410 } })
  })

  it('reads cross-sport equivalents entirely from national tables when they cover both metrics', async () => {
    const staff = await admin()
    const a = await athlete('FORTY_YARD_DASH', 4.7)
    const result = await importNormDataset(
      staff.id,
      meta('2026'),
      [HEADER, 'FORTY_YARD_DASH,15,17,,,,,900,4.5,4.7,4.9,5.1,5.3', 'SIXTY_YARD_DASH,15,17,,,,,1100,6.6,6.8,7.0,7.3,7.6'].join('\n'),
    )
    if (!result.ok) throw new Error('import failed')
    await activateNormDataset(staff.id, result.datasetId)
    // Equivalents are shown only for other sports: a football player gets a baseball 60-yard dash.
    await db.athleteProfile.update({ where: { userId: a.id }, data: { sport: 'FOOTBALL' } })
    const projections = await athleteProjections(a.id)
    expect(projections).toEqual([expect.objectContaining({ target: 'SIXTY_YARD_DASH', standing: 75, value: 6.8, scope: 'national', source: expect.objectContaining({ edition: '2026' }) })])
  })
})

describe('norm upload route', () => {
  function upload(fields: Record<string, string>, file: File | null) {
    const form = new FormData()
    for (const [k, v] of Object.entries(fields)) form.set(k, v)
    if (file) form.set('file', file)
    return POST(new Request(`${env().APP_URL}/api/admin/norms`, { method: 'POST', body: form, headers: { origin: env().APP_URL } }))
  }
  const fields = { name: 'Showcase Norms', publisher: 'Example Testing Body', edition: '2026', population: 'High school athletes measured at test events.', sourceUrl: 'https://example.org/norms', licence: 'Test licence covering display.', licenceConfirmed: 'on' }
  const file = () => new File([`${HEADER}\nEXIT_VELOCITY,15,16,,,,,1200,70,76,81,86,90`], 'norms.csv', { type: 'text/csv' })

  it('answers 404 to anyone but staff and rejects other origins', async () => {
    expect((await upload(fields, file())).status).toBe(404)
    sessionUser = await createAthlete()
    expect((await upload(fields, file())).status).toBe(404)
    sessionUser = await admin()
    const crossSite = await POST(new Request(`${env().APP_URL}/api/admin/norms`, { method: 'POST', body: new FormData(), headers: { origin: 'https://evil.example' } }))
    expect(crossSite.status).toBe(403)
  })

  it('imports a draft for staff and explains what is missing', async () => {
    sessionUser = await admin()
    const missing = await upload({ ...fields, licenceConfirmed: '' }, file())
    expect(missing.status).toBe(400)
    expect((await missing.json()).fieldErrors.licenceConfirmed).toMatch(/Confirm/)
    expect((await upload(fields, null)).status).toBe(400)
    const ok = await upload(fields, file())
    expect(ok.status).toBe(201)
    expect(await db.normDataset.findFirstOrThrow()).toMatchObject({ status: 'DRAFT', rowCount: 1 })
  })
})
