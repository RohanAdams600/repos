import { PDFDocument, PDFName, StandardFonts } from 'pdf-lib'
import { describe, expect, it } from 'vitest'
import { commonAnchor, comparisonRows, mirrorTrack, peaksRelativeToFootStrike, syncWindow } from '@/lib/biomechanics/compare'
import { birthDateWindow, cohortBands, describeBands, K_MIN, rankInCohort } from '@/lib/insights/build-cohort'
import { projectAcrossSports, traitOf, valueAtStanding } from '@/lib/insights/projection'
import { percentileRank } from '@/lib/metrics/percentile'
import { encodable, renderProfilePdf } from '@/lib/profile/pdf'
import type { ProfileCard } from '@/lib/profile/public'
import { isProfileSlug, makeProfileSlug } from '@/lib/profile/slug'
import { checkDraft, mailtoHref, type OutreachFacts } from '@/lib/recruiting/draft-check'
import { evaluateEvidence } from '@/lib/verification/checks'
import { findMoovBox, parseMovieHeader } from '@/lib/verification/mp4'
import { syntheticMp4 } from '../helpers/mp4'

describe('public profile links', () => {
  it('uses the first name and 8 unambiguous random characters, never the last name', () => {
    const slug = makeProfileSlug('José', new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]))
    expect(slug).toBe('jose-abcdefgh')
    expect(isProfileSlug(slug)).toBe(true)
    expect(makeProfileSlug('  ', new Uint8Array(8))).toBe('athlete-aaaaaaaa')
    expect(isProfileSlug(makeProfileSlug('Riley'))).toBe(true)
  })

  it('rejects anything that is not a generated slug', () => {
    for (const bad of ['riley', 'riley-abc', 'riley-ABCDEFGH', 'riley-abcdefg1', '../etc', 'riley-abcdefgh/x']) expect(isProfileSlug(bad)).toBe(false)
  })
})

describe('MP4 metadata reader', () => {
  const read = (bytes: Uint8Array) => async (start: number, length: number) => bytes.slice(start, start + length)

  for (const [label, options] of [
    ['moov after mdat, version 0', { moovFirst: false, version: 0 as const }],
    ['moov first, version 1', { moovFirst: true, version: 1 as const }],
  ] as const) {
    it(`finds the movie header (${label})`, async () => {
      const createdAt = new Date('2026-09-30T18:04:05Z')
      const bytes = syntheticMp4({ ...options, createdAt, durationSec: 12.5 })
      const moov = await findMoovBox(read(bytes), bytes.length)
      expect(moov?.type).toBe('moov')
      const header = parseMovieHeader(bytes.slice(moov!.start + moov!.headerSize, moov!.start + moov!.size), new Date('2026-10-04T00:00:00Z'))
      expect(header).toEqual({ durationMs: 12_500, createdAt })
    })
  }

  it('treats an unset or future camera clock as unknown', async () => {
    const now = new Date('2026-10-04T00:00:00Z')
    for (const createdAt of [null, new Date('2027-01-01T00:00:00Z')]) {
      const bytes = syntheticMp4({ createdAt })
      const moov = (await findMoovBox(read(bytes), bytes.length))!
      expect(parseMovieHeader(bytes.slice(moov.start + moov.headerSize, moov.start + moov.size), now)?.createdAt).toBeNull()
    }
  })

  it('stops on corrupt box sizes instead of reading out of bounds', async () => {
    const bytes = syntheticMp4()
    new DataView(bytes.buffer).setUint32(16, 0xfffffff0)
    expect(await findMoovBox(read(bytes), bytes.length)).toBeNull()
  })
})

describe('evidence pre-checks', () => {
  const base = { container: 'mp4' as const, sizeBytes: 5_000_000, durationMs: 9_000, recordedAt: new Date('2026-09-30'), metricDate: new Date('2026-09-29'), usedByOtherAthlete: false, usedForOtherMetric: false }

  it('sends plausible evidence to a person and flags what they should look at', () => {
    expect(evaluateEvidence(base)).toEqual({
      decision: 'review',
      checks: { container: 'ok', size: 'ok', duration: 'ok', recordedDate: 'matches', recordedDaysFromMeasurement: 1, reuse: 'none' },
    })
    const flagged = evaluateEvidence({ ...base, recordedAt: new Date('2026-06-01'), usedForOtherMetric: true })
    expect(flagged.decision).toBe('review')
    expect(flagged.checks).toMatchObject({ recordedDate: 'differs', reuse: 'other-metric' })
    expect(evaluateEvidence({ ...base, recordedAt: null, durationMs: null }).checks).toMatchObject({ recordedDate: 'unknown', duration: 'unknown' })
  })

  it('rejects what can never be valid evidence', () => {
    expect(evaluateEvidence({ ...base, container: null })).toMatchObject({ decision: 'reject', reason: 'UNREADABLE_FILE' })
    expect(evaluateEvidence({ ...base, durationMs: 61_000 })).toMatchObject({ decision: 'reject', reason: 'TOO_LONG' })
    expect(evaluateEvidence({ ...base, usedByOtherAthlete: true })).toMatchObject({ decision: 'reject', reason: 'DUPLICATE_VIDEO' })
  })
})

describe('biometric percentile cohorts', () => {
  it('widens age, height and weight bands step by step', () => {
    const bands = cohortBands({ age: 16, heightInches: 72, weightLbs: 180 })
    expect(bands[0]).toEqual({ level: 0, ageMin: 16, ageMax: 16, heightMin: 71, heightMax: 73, weightMin: 170, weightMax: 190 })
    expect(bands.at(-1)).toMatchObject({ ageMin: 14, ageMax: 18, heightMin: 68, heightMax: 76, weightMin: 145, weightMax: 215 })
    expect(describeBands(bands[0]!)).toBe('age 16, 71 to 73 in, 170 to 190 lb')
    expect(K_MIN).toBe(25)
  })

  it('turns an age range into an exact birth date window', () => {
    const { bornAfter, bornOnOrBefore } = birthDateWindow(16, 16, new Date('2026-10-04T00:00:00Z'))
    expect(bornAfter.toISOString().slice(0, 10)).toBe('2009-10-04')
    expect(bornOnOrBefore.toISOString().slice(0, 10)).toBe('2010-10-04')
  })

  it('ranks within the cohort, counting ties as half and mirroring timed events', () => {
    const values = [80, 82, 84, 86, 88, 90, 92, 94, 96, 98]
    expect(rankInCohort(91, values, true)).toBe(60)
    expect(rankInCohort(90, values, true)).toBe(55)
    expect(rankInCohort(200, values, true)).toBe(99)
    expect(rankInCohort(0, values, true)).toBe(1)
    // 60-yard dash: lower is better.
    expect(rankInCohort(6.6, [6.5, 6.7, 6.9, 7.1], false)).toBe(75)
  })
})

describe('cross-sport equivalents', () => {
  const q = { p10: 70, p25: 75, p50: 80, p75: 85, p90: 90 }
  const dash = { p10: 6.6, p25: 6.8, p50: 7.0, p75: 7.3, p90: 7.6 }

  it('inverts the percentile function inside the resolved range', () => {
    for (const standing of [15, 40, 50, 63, 85]) {
      const { value, bound } = valueAtStanding('PITCH_VELO', standing, q)
      expect(bound).toBe('exact')
      expect(Math.abs(percentileRank('PITCH_VELO', value, q) - standing)).toBeLessThanOrEqual(1)
    }
    // Lower is better: the 80th standing is a fast (low) time.
    const fast = valueAtStanding('SIXTY_YARD_DASH', 80, dash)
    expect(fast.value).toBeLessThan(6.8)
    expect(Math.abs(percentileRank('SIXTY_YARD_DASH', fast.value, dash) - 80)).toBeLessThanOrEqual(1)
  })

  it('reports tails as bounds instead of extrapolating', () => {
    expect(valueAtStanding('PITCH_VELO', 97, q)).toEqual({ value: 90, bound: 'at-least' })
    expect(valueAtStanding('SIXTY_YARD_DASH', 97, dash)).toEqual({ value: 6.6, bound: 'at-most' })
  })

  it('reads standing across sports within a trait and skips metrics already measured', () => {
    const projections = projectAcrossSports({ FORTY_YARD_DASH: 4.6, THROW_VELOCITY: 55 }, {
      FORTY_YARD_DASH: { p10: 4.5, p25: 4.7, p50: 4.9, p75: 5.1, p90: 5.3 },
      SIXTY_YARD_DASH: dash,
      THROW_VELOCITY: { p10: 40, p25: 45, p50: 50, p75: 55, p90: 60 },
      PITCH_VELO: q,
    })
    const targets = projections.map((p) => p.target).sort()
    expect(targets).toEqual(['PITCH_VELO', 'SIXTY_YARD_DASH'])
    const pitch = projections.find((p) => p.target === 'PITCH_VELO')!
    expect(pitch.trait).toBe('ARM')
    expect(pitch.standing).toBe(75)
    expect(pitch.value).toBe(85)
    expect(traitOf('SPIRAL_EFFICIENCY')).toBeNull()
  })
})

describe('side-by-side sync', () => {
  const report = (footStrikeTime: number | null) => ({
    footStrikeTime,
    peaks: [
      { segment: 'pelvis' as const, time: 1.05, speedDegPerSec: 500 },
      { segment: 'hand' as const, time: 1.2, speedDegPerSec: 2000 },
    ],
  })

  it('expresses peaks in milliseconds from foot strike', () => {
    expect(peaksRelativeToFootStrike(report(1))).toEqual({ pelvis: 50, hand: 200 })
    expect(peaksRelativeToFootStrike(report(null))).toEqual({})
    const { anchor, rows } = comparisonRows(report(1), report(0.9))
    expect(anchor).toEqual({ event: 'FOOT_STRIKE', a: 1, b: 0.9 })
    expect(rows.find((r) => r.segment === 'pelvis')).toEqual({ segment: 'pelvis', a: 50, b: 150, differenceMs: -100 })
    expect(rows.find((r) => r.segment === 'torso')).toEqual({ segment: 'torso', a: null, b: null, differenceMs: null })
  })

  it('falls back to peak hand speed when either clip has no foot strike', () => {
    expect(commonAnchor(report(1), report(null))).toEqual({ event: 'HAND_PEAK', a: 1.2, b: 1.2 })
    const { rows } = comparisonRows(report(null), report(1))
    expect(rows.find((r) => r.segment === 'pelvis')).toEqual({ segment: 'pelvis', a: -150, b: -150, differenceMs: 0 })
    expect(commonAnchor({ footStrikeTime: null, peaks: [] }, report(1))).toBeNull()
  })

  it('plays only the stretch both clips cover', () => {
    expect(syncWindow({ anchorTime: 2, durationSec: 5 }, { anchorTime: 1, durationSec: 6 })).toEqual({ start: -1, end: 3 })
  })

  it('mirrors a track and swaps left and right keypoints', () => {
    const mirrored = mirrorTrack({ aspectRatio: 1, frames: [{ t: 0, keypoints: { left_wrist: { x: 0.2, y: 0.5, score: 0.9 }, nose: { x: 0.5, y: 0.1, score: 1 } } }] })
    expect(mirrored.frames[0]!.keypoints.right_wrist).toEqual({ x: 0.8, y: 0.5, score: 0.9 })
    expect(mirrored.frames[0]!.keypoints.left_wrist).toBeUndefined()
    expect(mirrored.frames[0]!.keypoints.nose?.x).toBe(0.5)
  })
})

describe('outreach draft checks', () => {
  const facts: OutreachFacts = {
    athlete: {
      name: 'Riley Smith',
      gradYear: 2027,
      position: 'Shortstop',
      height: `6' 1"`,
      weightLbs: 182,
      gpa: 3.8,
      highSchool: 'Lincoln High School',
      measurements: [{ label: 'Exit velocity', value: '94.2 mph', measuredOn: '2026-08-14', verified: true }],
      profileUrl: 'https://kineticscout.example/p/riley-abcdefgh',
    },
    program: { school: 'State University', division: 'D1', conference: null, headCoachName: 'Jordan Lee', headCoachBackground: null, recentSeason: '2026: 38-21' },
    occasion: { kind: 'COACH_CHANGE', newCoach: 'Jordan Lee' },
  }
  const good = {
    subject: 'Class of 2027 shortstop, Riley Smith',
    body: 'Coach Lee, congratulations on your new role at State University. I am Riley Smith, a 2027 shortstop at Lincoln High School. My exit velocity is 94.2 mph (verified). My profile: https://kineticscout.example/p/riley-abcdefgh. Riley Smith, class of 2027',
  }

  it('accepts a draft built only from the fact sheet', () => {
    expect(checkDraft(good, facts, 'EMAIL')).toEqual([])
  })

  it('catches invented numbers, missing coach or link, promises and em dashes', () => {
    expect(checkDraft({ ...good, body: good.body.replace('94.2 mph', '97 mph') }, facts, 'EMAIL')[0]).toContain('97')
    expect(checkDraft({ ...good, body: good.body.replace('Coach Lee', 'Coach') }, facts, 'EMAIL')).toContain('draft does not address the head coach on file')
    expect(checkDraft({ ...good, body: good.body.replace('https://kineticscout.example/p/riley-abcdefgh', 'my profile') }, facts, 'EMAIL')).toContain('draft must include the profile link')
    expect(checkDraft({ ...good, body: `${good.body} I guarantee results.` }, facts, 'EMAIL').some((p) => p.includes('banned'))).toBe(true)
    expect(checkDraft({ ...good, body: good.body.replace(', a 2027', ` ${String.fromCharCode(0x2014)} a 2027`) }, facts, 'EMAIL').some((p) => p.includes('banned'))).toBe(true)
    expect(checkDraft({ subject: '', body: good.body }, facts, 'EMAIL')).toContain('email needs a subject')
  })

  it('builds a mailto link only when it is short enough for mail apps', () => {
    expect(mailtoHref('coach@state.example', 'Hi', 'Body text')).toBe('mailto:coach@state.example?subject=Hi&body=Body%20text')
    expect(mailtoHref(null, 'Hi', 'x')).toBeNull()
    expect(mailtoHref('coach@state.example', 'Hi', 'x'.repeat(3000))).toBeNull()
  })
})

describe('profile PDF', () => {
  const card: ProfileCard = {
    athleteId: 'a',
    slug: 'lukasz-abcdefgh',
    isPublic: true,
    firstName: 'Łukasz',
    lastName: 'Đoković',
    gradYear: 2027,
    sport: 'BASEBALL',
    position: 'CATCHER',
    positionLabel: 'Catcher',
    bats: 'RIGHT',
    throws: 'RIGHT',
    heightInches: 71,
    weightLbs: 190,
    gpa: null,
    highSchool: null,
    twitterHandle: null,
    metrics: [
      { metricType: 'POP_TIME', label: 'Pop time', unit: 's', decimals: 2, best: 1.92, bestDate: '2026-09-01', bestVerified: true, bestCoachRecorded: false, bestRecordedBy: null, verifiedBest: null, classPercentile: 81, cohortSize: 40 },
      { metricType: 'SIXTY_YARD_DASH', label: '60-yard dash', unit: 's', decimals: 2, best: 6.95, bestDate: '2026-09-20', bestVerified: false, bestCoachRecorded: true, bestRecordedBy: 'J. Lee, Westlake High School, Fall testing on 2026-09-20', verifiedBest: null, classPercentile: null, cohortSize: null },
    ],
    verifiedCount: 1,
  }

  it('renders a one-page PDF with a clickable profile link, even for names outside the standard font', async () => {
    const bytes = await renderProfilePdf(card, { publicUrl: 'https://kineticscout.example/p/lukasz-abcdefgh', generatedAt: new Date('2026-10-04T00:00:00Z') })
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-')
    const doc = await PDFDocument.load(bytes)
    expect(doc.getPageCount()).toBe(1)
    expect(doc.getTitle()).toBe('Łukasz Đoković recruiting profile')
    const annots = doc.getPage(0).node.Annots()
    expect(annots?.size()).toBe(1)
    const link = doc.context.lookup(annots!.get(0)) as import('pdf-lib').PDFDict
    const action = link.lookup(PDFName.of('A')) as import('pdf-lib').PDFDict
    expect((action.lookup(PDFName.of('URI')) as import('pdf-lib').PDFString).decodeText()).toBe('https://kineticscout.example/p/lukasz-abcdefgh')
  })

  it('transliterates letters the standard font cannot encode', async () => {
    const doc = await PDFDocument.create()
    const font = await doc.embedFont(StandardFonts.Helvetica)
    expect(encodable(font, 'Łukasz Đoković Søren 李')).toBe('Lukasz Dokovic Søren ?')
  })
})
