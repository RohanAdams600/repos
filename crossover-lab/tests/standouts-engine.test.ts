import { describe, expect, it } from 'vitest'
import { FTS_TO_MS, LB_TO_KG } from '../src/data/metrics'
import { BUILT_IN } from '../src/data/roster'
import type { Athlete, Measured, Metrics, SeasonLine } from '../src/data/types'
import { gradeHistory } from '../src/grades/grades'
import { normalCdf } from '../src/grades/norms'
import {
  buildStandouts,
  lowRecognition,
  ordinal,
  outliers,
  SECTION_CAP,
  SECTION_IDS,
  speedScore,
  weekOf,
  type SectionId,
  type StandoutEntry,
  type StandoutOptions,
  type Standouts,
} from '../src/standouts/engine'

const [taylor, ohtani, mitchell] = BUILT_IN as [Athlete, Athlete, Athlete]

const TODAY = new Date('2026-10-14T12:00:00Z')

const ver = (value: number, extra: Partial<Measured> = {}): Measured => ({ value, quality: 'VERIFIED', sourceId: 'test-source', ...extra })
const est = (value: number): Measured => ({ value, quality: 'ESTIMATED', note: 'Test estimate.' })
const sim = (value: number): Measured => ({ value, quality: 'SIMULATED' })

/** Synthetic athlete on a built-in template, with only the given metrics on file. */
function make(template: Athlete, id: string, group: string, metrics: Metrics, extra: Partial<Athlete> = {}): Athlete {
  const a = structuredClone(template)
  a.id = id
  a.name = `Player ${id}`
  a.position = group
  a.positionGroup = group
  a.profile = 'standout'
  a.metrics = metrics
  a.seasons = []
  delete a.pitches
  delete a.recognition
  return Object.assign(a, extra)
}

const nfl = (id: string, group: string, metrics: Metrics, extra: Partial<Athlete> = {}) => make(taylor, id, group, metrics, extra)
const mlb = (id: string, group: string, metrics: Metrics, extra: Partial<Athlete> = {}) => make(ohtani, id, group, metrics, extra)
const nba = (id: string, group: string, metrics: Metrics, extra: Partial<Athlete> = {}) => make(mitchell, id, group, metrics, extra)

const season = (year: number, metrics: Metrics, games?: Measured): SeasonLine => ({ season: String(year), year, team: 'TST', metrics, ...(games ? { games } : {}) })

function page(athletes: Athlete[], options: Partial<StandoutOptions> = {}): Standouts {
  return buildStandouts(athletes, { league: 'NFL', today: TODAY, ...options })
}

function section(p: Standouts, id: SectionId): StandoutEntry[] {
  return p.sections.find((s) => s.id === id)!.entries
}

const allEntries = (p: Standouts): StandoutEntry[] => p.sections.flatMap((s) => s.entries)

describe('weekOf', () => {
  it('returns the Monday of the week as an ISO date', () => {
    expect(weekOf(new Date('2026-10-14T12:00:00Z'))).toBe('2026-10-12')
    expect(weekOf(new Date('2026-10-12T00:00:00Z'))).toBe('2026-10-12')
    expect(weekOf(new Date('2026-10-18T23:59:59Z'))).toBe('2026-10-12')
    expect(weekOf(new Date('2026-10-19T00:00:00Z'))).toBe('2026-10-19')
  })

  it('crosses month and year boundaries', () => {
    expect(weekOf(new Date('2026-01-01T10:00:00Z'))).toBe('2025-12-29')
    expect(weekOf(new Date('2026-03-01T10:00:00Z'))).toBe('2026-02-23')
  })

  it('rejects an invalid date', () => {
    expect(() => weekOf(new Date('not a date'))).toThrow(RangeError)
  })

  it('stamps the page with the week of today', () => {
    expect(page([]).generatedWeek).toBe('2026-10-12')
  })
})

describe('page shape', () => {
  it('always has all eight sections in order, empty ones included', () => {
    const p = page([])
    expect(p.sections.map((s) => s.id)).toEqual([...SECTION_IDS])
    expect(p.sections.every((s) => s.entries.length === 0)).toBe(true)
    expect(p.notes).toContain('No NFL athletes on file.')
  })

  it('labels the arms section by league', () => {
    expect(buildStandouts([], { league: 'NBA', today: TODAY }).sections.find((s) => s.id === 'arms')!.label).toBe('Longest arms')
    expect(page([]).sections.find((s) => s.id === 'arms')!.label).toBe('Strongest arms')
  })

  it('only lists athletes of the requested league', () => {
    for (const league of ['NFL', 'MLB', 'NBA'] as const) {
      const p = buildStandouts(BUILT_IN, { league, today: TODAY })
      expect(allEntries(p).length).toBeGreaterThan(0)
      expect(allEntries(p).every((e) => e.league === league)).toBe(true)
    }
  })

  it('gives every built-in entry a label, a quality, a ranked-on-file text and one plain sentence', () => {
    for (const league of ['NFL', 'MLB', 'NBA'] as const) {
      for (const e of allEntries(buildStandouts(BUILT_IN, { league, today: TODAY }))) {
        expect(e.quality).not.toBe('SIMULATED')
        expect(e.rankText).toMatch(/^(tied for )?\d+(st|nd|rd|th) of \d+ (NFL|MLB|NBA) \w+ on file$/)
        expect(e.why).toMatch(/^[A-Z].*\.$/)
        expect(e.why.slice(0, -1)).not.toMatch(/\.\s/)
        expect(e.display.length).toBeGreaterThan(0)
        if (e.percentile !== undefined) expect(e.percentileQuality).not.toBe('VERIFIED')
      }
    }
  })

  it('formats ordinals', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101, 111, 112].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd', '101st', '111th', '112th'])
  })
})

describe('SIMULATED figures never qualify', () => {
  const fast = nfl('fake', 'RB', { fortyS: sim(4.2), weightLb: sim(250), topSpeedMph: sim(24), benchReps225: sim(40), maxVerticalIn: sim(45) })
  const real = nfl('real', 'RB', { fortyS: ver(4.6) })

  it('leaves a simulated figure out of every section and the rank count', () => {
    const p = page([fast, real])
    expect(allEntries(p).some((e) => e.athleteId === 'fake')).toBe(false)
    expect(section(p, 'fastest')[0]!.rankText).toBe('1st of 1 NFL athlete on file')
    expect(allEntries(p).every((e) => e.quality !== 'SIMULATED')).toBe(true)
  })

  it('says how many simulated figures were left out', () => {
    expect(page([fast, real]).notes.some((n) => /^\d+ SIMULATED figures were left out/.test(n))).toBe(true)
    expect(page([real]).notes.some((n) => n.includes('SIMULATED figure'))).toBe(false)
  })

  it('drops a derived build when any input is simulated', () => {
    const halfReal = nfl('half', 'RB', { fortyS: ver(4.4), weightLb: sim(230) })
    expect(section(page([halfReal]), 'builds')).toEqual([])
  })

  it('drops season changes that rest on a simulated season figure', () => {
    const a = nfl('seasons', 'RB', {}, { seasons: [season(2024, { rushYards: sim(500) }), season(2025, { rushYards: ver(1500) })] })
    expect(section(page([a]), 'improved')).toEqual([])
  })
})

describe('leaderboards', () => {
  const forties = [nfl('b', 'RB', { fortyS: ver(4.5) }), nfl('a', 'RB', { fortyS: ver(4.3) }), nfl('c', 'RB', { fortyS: ver(4.4) })]

  it('puts the lowest time first when lower is better', () => {
    const fastest = section(page(forties), 'fastest')
    expect(fastest.map((e) => e.value)).toEqual([4.3, 4.4, 4.5])
    expect(fastest.map((e) => e.rankText)).toEqual(['1st of 3 NFL athletes on file', '2nd of 3 NFL athletes on file', '3rd of 3 NFL athletes on file'])
    expect(fastest[0]!.display).toBe('4.30 s')
    expect(fastest[0]!.metric).toBe('fortyS')
  })

  it('puts the highest figure first when higher is better', () => {
    const p = page([nfl('slow', 'WR', { topSpeedMph: ver(21) }), nfl('quick', 'WR', { topSpeedMph: ver(22.5) })])
    expect(section(p, 'fastest').map((e) => e.athleteId)).toEqual(['quick', 'slow'])
  })

  it('ties figures that look the same and says so', () => {
    const p = page([nfl('a', 'RB', { fortyS: ver(4.3) }), nfl('b', 'RB', { fortyS: ver(4.4) }), nfl('c', 'RB', { fortyS: ver(4.401) }), nfl('d', 'RB', { fortyS: ver(4.5) })])
    const ranks = section(p, 'fastest').map((e) => e.rankText)
    expect(ranks).toEqual(['1st of 4 NFL athletes on file', 'tied for 2nd of 4 NFL athletes on file', 'tied for 2nd of 4 NFL athletes on file', '4th of 4 NFL athletes on file'])
  })

  it('lists each athlete once per section, on his best figure', () => {
    const star = nfl('star', 'WR', { fortyS: ver(4.3), topSpeedMph: ver(23), tenSplitS: ver(1.48) })
    const other = nfl('other', 'WR', { fortyS: ver(4.5), topSpeedMph: ver(21) })
    const fastest = section(page([star, other]), 'fastest')
    expect(fastest.map((e) => e.athleteId)).toEqual(['star', 'other'])
  })

  it('caps a section at ten and skips the small-sample note for a big enough field', () => {
    const many = Array.from({ length: 12 }, (_, i) => nfl(`p${String(i).padStart(2, '0')}`, 'RB', { fortyS: ver(4.3 + i * 0.02) }))
    const p = page(many)
    const fastest = section(p, 'fastest')
    expect(fastest).toHaveLength(SECTION_CAP)
    expect(fastest[0]!.rankText).toBe('1st of 12 NFL athletes on file')
    expect(fastest.at(-1)!.rankText).toBe('10th of 12 NFL athletes on file')
    expect(p.notes.some((n) => n.startsWith('Ranks for 40-yard dash'))).toBe(false)
  })

  it('notes when ranks are among a small sample, honouring minSample', () => {
    expect(page(forties).notes).toContain('Ranks for 40-yard dash are among a small sample (3 NFL athletes on file).')
    expect(page(forties, { minSample: 3 }).notes.some((n) => n.startsWith('Ranks for 40-yard dash'))).toBe(false)
  })

  it('carries the source rank wording verbatim and never writes its own', () => {
    const holder = nfl('holder', 'RB', { fortyS: ver(4.22, { rank: 'NFL Scouting Combine record' }) })
    const plain = nfl('plain', 'RB', { fortyS: ver(4.4) })
    const fastest = section(page([holder, plain]), 'fastest')
    expect(fastest[0]!.sourceRank).toBe('NFL Scouting Combine record')
    expect('sourceRank' in fastest[1]!).toBe(false)
    expect(fastest[0]!.why).not.toContain('Combine record')
  })

  it('carries source and date', () => {
    const a = nfl('dated', 'RB', { fortyS: ver(4.4, { asOf: '2020-02' }) })
    const e = section(page([a]), 'fastest')[0]!
    expect(e.sourceId).toBe('test-source')
    expect(e.asOf).toBe('2020-02')
  })

  it('rates against the position norm with an ESTIMATED percentile and flags outliers at 1.645 z', () => {
    const p = page([nfl('elite', 'RB', { fortyS: ver(4.3) }), nfl('good', 'RB', { fortyS: ver(4.39) }), nfl('par', 'RB', { fortyS: ver(4.55) })])
    const [elite, good, par] = section(p, 'fastest')
    expect(elite!.quality).toBe('VERIFIED')
    expect(elite!.percentileQuality).toBe('ESTIMATED')
    expect(elite!.percentile).toBe(99)
    expect(elite!.outlier).toBe(true)
    // z = 1.6: just short of the line, and the percentile must not read 95.
    expect(good!.outlier).toBe(false)
    expect(good!.percentile).toBe(94)
    expect(par!.percentile).toBe(Math.floor(normalCdf(0) * 100))
    expect(elite!.why).toContain('percentile for NFL running backs')
    expect(p.notes.some((n) => n.startsWith('Percentiles compare against approximate position norms'))).toBe(true)
  })

  it('gives no percentile where the position group has no norm table of its own', () => {
    const kicker = nfl('kicker', 'ST', { fortyS: ver(4.9) })
    const e = section(page([kicker]), 'fastest')[0]!
    expect(e.percentile).toBeUndefined()
    expect(e.percentileQuality).toBeUndefined()
    expect(e.outlier).toBe(false)
  })

  it('counts only quarterbacks for NFL arms', () => {
    const back = nfl('back', 'RB', { throwVelocityMph: ver(62) })
    const qb = nfl('qb', 'QB', { throwVelocityMph: ver(58) })
    const arms = section(page([back, qb]), 'arms')
    expect(arms.map((e) => e.athleteId)).toEqual(['qb'])
    expect(arms[0]!.rankText).toBe('1st of 1 NFL quarterback on file')
  })

  it('uses the league lists: MLB bat speed is explosive, home to first is a time', () => {
    const p = buildStandouts([mlb('bat', 'H', { batSpeedMph: ver(77), homeToFirstS: ver(4.4) }), mlb('legs', 'H', { homeToFirstS: ver(4.05) })], { league: 'MLB', today: TODAY })
    expect(section(p, 'explosive').map((e) => e.metric)).toEqual(['batSpeedMph'])
    expect(section(p, 'fastest').map((e) => e.athleteId)).toEqual(['legs', 'bat'])
  })

  it('ranks NBA arms by wingspan and strength by whatever lifts are on file', () => {
    const p = buildStandouts([nba('long', 'W', { wingspanIn: ver(88) }), nba('short', 'G', { wingspanIn: ver(80), bench1RmLb: ver(300) })], { league: 'NBA', today: TODAY })
    expect(section(p, 'arms').map((e) => e.athleteId)).toEqual(['long', 'short'])
    expect(section(p, 'strongest').map((e) => e.metric)).toEqual(['bench1RmLb'])
  })

  it('is deterministic, independent of input order, and leaves the input alone', () => {
    const field = [...BUILT_IN, ...forties, nfl('qb', 'QB', { throwVelocityMph: ver(58), fortyS: ver(4.4) })]
    const before = JSON.stringify(field)
    const one = page(field)
    expect(page(field)).toEqual(one)
    expect(page([...field].reverse())).toEqual(one)
    expect(JSON.stringify(field)).toBe(before)
  })

  it('counts an athlete listed twice only once', () => {
    const a = nfl('dup', 'RB', { fortyS: ver(4.4) })
    expect(section(page([a, a]), 'fastest')[0]!.rankText).toBe('1st of 1 NFL athlete on file')
  })
})

describe('rarest builds', () => {
  it('computes Speed Score as weight x 200 / 40^4 and labels it ESTIMATED', () => {
    const a = nfl('back', 'RB', { weightLb: ver(226), fortyS: ver(4.39) })
    const e = section(page([a]), 'builds').find((x) => x.metric === 'speedScore')!
    expect(e.value).toBeCloseTo((226 * 200) / Math.pow(4.39, 4), 9)
    expect(speedScore(226, 4.39)).toBeCloseTo(121.7, 1)
    expect(e.quality).toBe('ESTIMATED')
    expect(e.display).toBe('121.7 (226 lb at 4.39 s)')
    expect(e.percentileQuality).toBe('ESTIMATED')
  })

  it('finds a rare size-speed combination at the 95th percentile on both', () => {
    // WR norms: top speed 20.8 +/- 0.9 mph, height 72.5 +/- 2.2 in.
    const rare = nfl('rare', 'WR', { topSpeedMph: ver(22.6), heightIn: ver(77) })
    const fastOnly = nfl('fast', 'WR', { topSpeedMph: ver(22.6), heightIn: ver(72) })
    const fakeSize = nfl('fake', 'WR', { topSpeedMph: ver(22.6), heightIn: sim(80) })
    const builds = section(page([rare, fastOnly, fakeSize]), 'builds')
    expect(builds.map((e) => e.athleteId)).toEqual(['rare'])
    const e = builds[0]!
    expect(e.metric).toBe('rareCombo')
    expect(e.label).toBe('Top speed + Height')
    expect(e.outlier).toBe(true)
    expect(e.percentile).toBeGreaterThanOrEqual(95)
    expect(e.value).toBe(e.percentile)
    expect(e.quality).toBe('ESTIMATED')
    expect(e.rankText).toBe('1st of 2 NFL athletes on file')
    expect(e.display).toBe(`22.6 mph top speed at 6'5" (77.0 in) tall`)
  })

  it('measures NBA wingspan over height and ranks standing reach', () => {
    const p = buildStandouts([nba('wing', 'W', { wingspanIn: ver(88), heightIn: ver(79), standingReachIn: ver(108) })], { league: 'NBA', today: TODAY })
    const builds = section(p, 'builds')
    expect(builds).toHaveLength(1)
    const e = builds[0]!
    // Ape index z = (9 - 4) / 2.5 = 2.0 beats standing reach z = (108 - 105) / 2.5 = 1.2.
    expect(e.metric).toBe('apeIndexIn')
    expect(e.value).toBe(9)
    expect(e.display).toBe('+9.0 in')
    expect(e.quality).toBe('ESTIMATED')
  })

  it('gives MLB a momentum build from weight and sprint speed', () => {
    const p = buildStandouts([mlb('big', 'H', { weightLb: ver(240), sprintSpeedFtS: ver(29) })], { league: 'MLB', today: TODAY })
    const e = section(p, 'builds')[0]!
    expect(e.metric).toBe('momentum')
    expect(e.value).toBeCloseTo(240 * LB_TO_KG * 29 * FTS_TO_MS, 9)
    expect(e.display).toBe(`${Math.round(e.value)} kg·m/s`)
    expect(e.percentile).toBeUndefined()
  })

  it('sorts builds by rarity against the position norm', () => {
    const p = page([nfl('ordinary', 'RB', { weightLb: ver(213), fortyS: ver(4.55) }), nfl('freak', 'RB', { weightLb: ver(235), fortyS: ver(4.38) })])
    expect(section(p, 'builds').map((e) => e.athleteId)).toEqual(['freak', 'ordinary'])
  })
})

describe('outliers', () => {
  it('lists every figure at or above the 95th percentile, strongest first', () => {
    const a = nfl('x', 'RB', { fortyS: ver(4.3), weightLb: ver(240), broadJumpIn: ver(120), maxVerticalIn: sim(45) })
    const list = outliers(a)
    expect(list.map((o) => o.metric)).toEqual(['speedScore', 'fortyS', 'weightLb'])
    for (const o of list) {
      expect(o.z).toBeGreaterThanOrEqual(1.645)
      expect(o.percentile).toBeGreaterThanOrEqual(95)
      expect(o.percentileQuality).toBe('ESTIMATED')
      expect(o.why).toMatch(/percentile for NFL running backs by approximate norms\.$/)
    }
    expect(list.find((o) => o.metric === 'fortyS')!.quality).toBe('VERIFIED')
    expect(list.find((o) => o.metric === 'speedScore')!.quality).toBe('ESTIMATED')
  })

  it('finds the built-in guard\'s length and burst', () => {
    const ids = outliers(mitchell).map((o) => o.metric)
    expect(ids).toContain('apeIndexIn')
    expect(ids).toContain('threeQuarterSprintS')
  })

  it('returns nothing without a position norm table or without real figures', () => {
    expect(outliers(nfl('k', 'ST', { fortyS: ver(4.3) }))).toEqual([])
    expect(outliers(nfl('s', 'RB', { fortyS: sim(4.1) }))).toEqual([])
  })
})

describe('hidden gems', () => {
  /** A running back whose verified 4.30 forty alone gives an athleticism grade in the 90s. */
  const gem = (id: string, extra: Partial<Athlete>, forty = 4.3) => nfl(id, 'RB', { fortyS: ver(forty) }, extra)

  it('needs athleticism of 85 or more and a known low-recognition signal', () => {
    const field = [
      gem('undrafted', { recognition: { undrafted: true } }),
      gem('late', { recognition: { draftRound: 5 } }),
      gem('early', { recognition: { draftRound: 2 } }),
      gem('unknown', {}),
      gem('squad', { status: 'practice-squad' }),
      gem('noBowl', { recognition: { allStarSelections: 0 } }),
      gem('slowGem', { recognition: { undrafted: true } }, 4.55),
    ]
    const ids = section(page(field), 'hidden').map((e) => e.athleteId)
    expect([...ids].sort()).toEqual(['late', 'noBowl', 'squad', 'undrafted'])
  })

  it('never calls an All-Star or a Legend hidden', () => {
    expect(lowRecognition(gem('star', { recognition: { draftRound: 6, allStarSelections: 3 } }))).toBeUndefined()
    expect(lowRecognition(gem('old', { status: 'legend', recognition: { undrafted: true } }))).toBeUndefined()
    expect(lowRecognition(gem('twoWay', { status: 'two-way' }))).toBe('is on a two-way contract')
    expect(lowRecognition(gem('r5', { recognition: { draftRound: 5, allStarSelections: 0 } }))).toBe('was a 5th-round pick and has no Pro Bowl selections')
  })

  it('labels the grade ESTIMATED, explains it, and ranks it on file', () => {
    const p = page([gem('a', { recognition: { undrafted: true } }), gem('b', { recognition: { undrafted: true } }, 4.38), nfl('c', 'RB', { fortyS: ver(4.6) })])
    const hidden = section(p, 'hidden')
    expect(hidden.map((e) => e.athleteId)).toEqual(['a', 'b'])
    expect(hidden[0]!.quality).toBe('ESTIMATED')
    expect(hidden[0]!.metric).toBe('athleticism')
    expect(hidden[0]!.value).toBeGreaterThanOrEqual(85)
    expect(hidden[0]!.rankText).toBe('1st of 3 NFL athletes on file')
    expect(hidden[0]!.why).toContain('yet went undrafted')
  })

  it('ignores athleticism resting on simulated figures', () => {
    const fake = nfl('fake', 'RB', { fortyS: sim(4.2) }, { recognition: { undrafted: true } })
    expect(section(page([fake]), 'hidden')).toEqual([])
  })
})

describe('rising and most improved', () => {
  const back = (id: string, before: number, after: number, extra: Partial<Athlete> = {}) =>
    nfl(id, 'RB', {}, { seasons: [season(2024, { rushYards: ver(before) }), season(2025, { rushYards: ver(after) })], ...extra })

  it('ranks the biggest season-over-season production gains', () => {
    const p = page([back('small', 1000, 1200), back('big', 800, 1500), back('down', 1200, 900)])
    const improved = section(p, 'improved')
    expect(improved.map((e) => e.athleteId)).toEqual(['big', 'small'])
    const e = improved[0]!
    expect(e.metric).toBe('rushYardsGain')
    expect(e.value).toBe(700)
    expect(e.display).toBe('+700 yd (800 yd to 1500 yd)')
    expect(e.quality).toBe('ESTIMATED')
    expect(e.asOf).toBe('2025')
    expect(e.rankText).toBe('1st of 3 NFL athletes on file')
    expect(e.why).toBe("Player big's rushing yards went from 800 yd in 2024 to 1500 yd in 2025, an improvement that ranks 1st of 3 NFL athletes on file.")
  })

  it('counts a drop as an improvement when lower is better', () => {
    const arm = mlb('arm', 'P', {}, { seasons: [season(2024, { pitchingEra: ver(4.5) }), season(2025, { pitchingEra: ver(3.2) })] })
    const e = section(buildStandouts([arm], { league: 'MLB', today: TODAY }), 'improved')[0]!
    expect(e.metric).toBe('pitchingEraGain')
    expect(e.value).toBeCloseTo(-1.3, 9)
    expect(e.display).toBe('−1.30 (4.50 to 3.20)')
  })

  it('compares only the latest season with the one before, and only recent ones', () => {
    const three = nfl('three', 'RB', {}, { seasons: [season(2023, { rushYards: ver(200) }), season(2024, { rushYards: ver(1400) }), season(2025, { rushYards: ver(1500) })] })
    expect(section(page([three]), 'improved')[0]!.value).toBe(100)
    const stale = nfl('stale', 'RB', {}, { seasons: [season(2019, { rushYards: ver(500) }), season(2020, { rushYards: ver(1500) })] })
    expect(section(page([stale]), 'improved')).toEqual([])
    // The same seasons count when today is 2021.
    expect(section(page([stale], { today: new Date('2021-03-01T00:00:00Z') }), 'improved')).toHaveLength(1)
  })

  it('skips a split season it cannot compare honestly', () => {
    const traded = nfl('traded', 'RB', {}, { seasons: [season(2024, { rushYards: ver(500) }), season(2025, { rushYards: ver(700) }), season(2025, { rushYards: ver(600) })] })
    expect(section(page([traded]), 'improved')).toEqual([])
  })

  it('derives yards per carry from each season line', () => {
    // Same yards on fewer carries: no yardage gain, but yards per carry rose from 4.0 to 5.0.
    const a = nfl('ypc', 'RB', { rushYardsPerCarry: ver(9.9) }, { seasons: [season(2024, { rushYards: ver(800), carries: ver(200) }), season(2025, { rushYards: ver(800), carries: ver(160) })] })
    const improved = section(page([a]), 'improved')
    expect(improved).toHaveLength(1)
    expect(improved[0]!.metric).toBe('rushYardsPerCarryGain')
    expect(improved[0]!.display).toBe('+1.0 yd (4.0 yd to 5.0 yd)')
  })

  /** A fully measured back so the overall grade rests on real inputs, with a weak then strong season. */
  function measuredBack(id: string, group = 'RB'): Athlete {
    const metrics: Metrics = {
      heightIn: ver(70),
      weightLb: ver(215),
      fortyS: ver(4.45),
      tenSplitS: ver(1.53),
      maxVerticalIn: ver(36),
      standingVerticalIn: ver(31),
      broadJumpIn: ver(122),
      shuttleS: ver(4.2),
      threeConeS: ver(6.95),
      bench1RmLb: ver(350),
      squat1RmLb: ver(500),
      deadlift1RmLb: ver(550),
      catchRatePct: est(80),
      yardsAfterContactPerCarry: est(3.1),
      repeatSprintDropPct: est(5),
      sitReachIn: est(13),
      bodyFatPct: est(9),
    }
    const seasons = [
      season(2024, { carries: ver(150), rushYards: ver(560), rushTd: ver(2) }, ver(10)),
      season(2025, { carries: ver(320), rushYards: ver(1700), rushTd: ver(16) }, ver(17)),
    ]
    return nfl(id, group, metrics, { seasons })
  }

  it('finds rising athletes by overall grade gain, never better than ESTIMATED', () => {
    const a = measuredBack('riser')
    const history = gradeHistory(a)
    expect(history.every((h) => h.quality !== 'SIMULATED')).toBe(true)
    const gain = history[1]!.overall - history[0]!.overall
    expect(gain).toBeGreaterThan(0)
    const rising = section(page([a]), 'rising')
    expect(rising).toHaveLength(1)
    expect(rising[0]!.metric).toBe('overallGain')
    expect(rising[0]!.value).toBe(gain)
    expect(rising[0]!.quality).toBe('ESTIMATED')
    expect(rising[0]!.display).toBe(`+${gain} (${history[0]!.overall} to ${history[1]!.overall})`)
  })

  it('leaves out overall grades that rest on simulated figures', () => {
    // The built-in profiles carry demo values, so their grade history is SIMULATED.
    for (const league of ['NFL', 'MLB', 'NBA'] as const) {
      expect(section(buildStandouts(BUILT_IN, { league, today: TODAY }), 'rising')).toEqual([])
    }
  })

  it('ranks every position group now that each has overall weights', () => {
    expect(section(page([measuredBack('receiver', 'WR')]), 'rising').length).toBeGreaterThan(0)
  })
})
