import { describe, expect, it } from 'vitest'
import { BUILT_IN } from '../src/data/roster'
import { divisionLabel, divisions, findTeam, getTeam, getTeamByAbbr, TEAMS, teamsByLeague, type Team } from '../src/data/teams'
import { contrastRatio, DEFAULT_KIT_BASIS, defaultGear, defaultKit, defaultMovement, jerseyColor, NEUTRAL_COLORS } from '../src/data/defaults'
import { importRoster, parseCsv, parseMetricValue, ROSTER_STATUSES, type ImportOptions, type RosterRow } from '../src/data/import'
import { gradesFor } from '../src/grades/grades'
import type { Athlete, GearItem, League, Measured } from '../src/data/types'

const LEAGUES: League[] = ['NFL', 'MLB', 'NBA']
const GROUPS: Record<League, string[]> = {
  NFL: ['RB', 'WR', 'TE', 'QB', 'DB', 'LB', 'DL', 'OL', 'ST'],
  MLB: ['H', 'P', 'TWP'],
  NBA: ['G', 'W', 'B'],
}
const HEX = /^#[0-9a-f]{6}$/
const COLORS = { primary: '#002c5f', secondary: '#ffffff' }

describe('teams', () => {
  it('has every club as of October 2026: NFL 32, MLB 30, NBA 30', () => {
    expect(teamsByLeague('NFL')).toHaveLength(32)
    expect(teamsByLeague('MLB')).toHaveLength(30)
    expect(teamsByLeague('NBA')).toHaveLength(30)
    expect(TEAMS).toHaveLength(92)
  })

  it('gives unique ids built from league and abbreviation, and unique abbreviations per league', () => {
    expect(new Set(TEAMS.map((t) => t.id)).size).toBe(92)
    for (const t of TEAMS) expect(t.id).toBe(`${t.league.toLowerCase()}-${t.abbr.toLowerCase()}`)
    for (const league of LEAGUES) {
      const list = teamsByLeague(league)
      expect(new Set(list.map((t) => t.abbr)).size).toBe(list.length)
      expect(new Set(list.map((t) => t.fullName)).size).toBe(list.length)
    }
    for (const id of ['nfl-ind', 'mlb-lad', 'nba-cle']) expect(getTeam(id)?.id).toBe(id)
  })

  it('resolves the teamId of every built-in athlete', () => {
    for (const a of BUILT_IN) {
      const team = getTeam(a.teamId!)
      expect(team, a.name).toBeDefined()
      expect(team!.league).toBe(a.league)
      expect(team!.fullName).toBe(a.team)
    }
  })

  it('keeps aliases from colliding with abbreviations or with each other inside a league', () => {
    for (const league of LEAGUES) {
      const codes = teamsByLeague(league).flatMap((t) => [t.abbr, ...t.aliases])
      expect(new Set(codes).size, league).toBe(codes.length)
    }
  })

  it('uses hex kit colors only, with distinct primary and secondary', () => {
    for (const t of TEAMS) {
      expect(t.colors.primary, t.id).toMatch(HEX)
      expect(t.colors.secondary, t.id).toMatch(HEX)
      expect(t.colors.primary, t.id).not.toBe(t.colors.secondary)
    }
  })

  const shape = (league: League) => divisions(league).map((d) => [d.conference, d.division, d.teams.length])

  it('splits the NFL into 8 divisions of 4 (AFC/NFC; East, North, South, West)', () => {
    const ds = divisions('NFL')
    expect(ds).toHaveLength(8)
    expect(ds.every((d) => d.teams.length === 4)).toBe(true)
    expect(new Set(ds.map((d) => d.conference))).toEqual(new Set(['AFC', 'NFC']))
    expect(new Set(ds.map((d) => d.division))).toEqual(new Set(['East', 'North', 'South', 'West']))
    expect(shape('NFL').filter(([c]) => c === 'AFC')).toHaveLength(4)
    expect(getTeam('nfl-ind')).toMatchObject({ conference: 'AFC', division: 'South', city: 'Indianapolis', name: 'Colts' })
  })

  it('splits MLB into 6 divisions of 5 (American/National League; East, Central, West)', () => {
    const ds = divisions('MLB')
    expect(ds).toHaveLength(6)
    expect(ds.every((d) => d.teams.length === 5)).toBe(true)
    expect(new Set(ds.map((d) => d.conference))).toEqual(new Set(['American League', 'National League']))
    expect(new Set(ds.map((d) => d.division))).toEqual(new Set(['East', 'Central', 'West']))
    expect(getTeam('mlb-lad')).toMatchObject({ conference: 'National League', division: 'West' })
  })

  it('splits the NBA into 6 divisions of 5 across the two conferences', () => {
    const ds = divisions('NBA')
    expect(ds).toHaveLength(6)
    expect(ds.every((d) => d.teams.length === 5)).toBe(true)
    expect(new Set(ds.map((d) => d.conference))).toEqual(new Set(['Eastern Conference', 'Western Conference']))
    expect(ds.map((d) => d.division).sort()).toEqual(['Atlantic', 'Central', 'Northwest', 'Pacific', 'Southeast', 'Southwest'])
    expect(getTeam('nba-cle')).toMatchObject({ conference: 'Eastern Conference', division: 'Central', name: 'Cavaliers' })
  })

  it('lists the Athletics in Sacramento under the name "Athletics"', () => {
    const a = getTeam('mlb-ath')!
    expect(a).toMatchObject({ city: 'Sacramento', name: 'Athletics', fullName: 'Athletics', abbr: 'ATH', division: 'West', conference: 'American League' })
    expect(getTeamByAbbr('MLB', 'OAK')?.id).toBe('mlb-ath')
  })

  it('looks teams up by abbreviation (any case), alias and name, scoped to the league', () => {
    expect(getTeamByAbbr('NFL', 'ind')?.id).toBe('nfl-ind')
    expect(getTeamByAbbr('NFL', ' JAC ')?.id).toBe('nfl-jax')
    expect(getTeamByAbbr('NBA', 'BRK')?.id).toBe('nba-bkn')
    expect(getTeamByAbbr('MLB', 'WSN')?.id).toBe('mlb-wsh')
    expect(getTeamByAbbr('NFL', 'PHI')?.name).toBe('Eagles')
    expect(getTeamByAbbr('NBA', 'PHI')?.name).toBe('76ers')
    expect(getTeamByAbbr('NFL', 'XYZ')).toBeUndefined()
    expect(getTeamByAbbr('NFL', '')).toBeUndefined()
    expect(getTeamByAbbr('NBA', 'LAD')).toBeUndefined()
    expect(findTeam('NFL', 'Colts')?.id).toBe('nfl-ind')
    expect(findTeam('NBA', 'golden state warriors')?.id).toBe('nba-gsw')
    expect(findTeam('MLB', 'Athletics')?.id).toBe('mlb-ath')
    expect(findTeam('MLB', 'Colts')).toBeUndefined()
    expect(getTeam('nfl-zzz')).toBeUndefined()
  })

  it('labels divisions the way fans say them', () => {
    expect(divisionLabel(getTeam('nfl-ind')!)).toBe('AFC South')
    expect(divisionLabel(getTeam('mlb-ath')!)).toBe('AL West')
    expect(divisionLabel(getTeam('mlb-lad')!)).toBe('NL West')
    expect(divisionLabel(getTeam('nba-cle')!)).toBe('Central')
  })
})

function checkGear(items: GearItem[], prefix: string): void {
  const ids = items.map((g) => g.id)
  expect(new Set(ids).size).toBe(ids.length)
  for (const g of items) {
    expect(g.id.startsWith(`${prefix}-`)).toBe(true)
    expect(g.quality).toBe('SIMULATED')
    expect(g.use.quality).toBe('SIMULATED')
    expect(g.basis).toBe(DEFAULT_KIT_BASIS)
    expect(g.color).toMatch(HEX)
    expect(g.use.usagePct).toBeGreaterThanOrEqual(0)
    expect(g.use.usagePct).toBeLessThanOrEqual(100)
    if (g.worn) expect(g.use.usagePct).toBeGreaterThan(0)
    if (g.variants) expect(g.variants.map((v) => v.id)).toContain(g.defaultVariant)
    for (const h of g.use.hotspots) {
      expect(h.along).toBeGreaterThanOrEqual(0)
      expect(h.along).toBeLessThanOrEqual(1)
      expect(h.intensity).toBeGreaterThanOrEqual(0)
      expect(h.intensity).toBeLessThanOrEqual(1)
      expect(h.label).not.toBe('')
    }
  }
  // One head covering at a time, or the rig would draw two shells on top of each other.
  expect(items.filter((g) => g.worn && ['helmet', 'battingHelmet', 'cap'].includes(g.slot)).length).toBeLessThanOrEqual(1)
}

const slots = (items: GearItem[], worn?: boolean) => items.filter((g) => worn === undefined || g.worn === worn).map((g) => g.slot)

describe('default gear', () => {
  it.each(LEAGUES.flatMap((l) => GROUPS[l].map((g) => [l, g] as const)))('%s %s: simulated, labelled, unique, sane hotspots', (league, group) => {
    const items = defaultGear(league, group, COLORS, 'x')
    checkGear(items, 'x')
    expect(items.some((g) => g.slot === 'jersey' && g.worn)).toBe(true)
    expect(items.some((g) => g.slot === 'shoes' && g.worn)).toBe(true)
    expect(items.some((g) => g.slot === 'socks' && g.worn)).toBe(true)
  })

  it('dresses NFL players in helmet, facemask, chin strap, jersey, pants, gloves, socks and shoes', () => {
    for (const group of GROUPS.NFL) {
      const items = defaultGear('NFL', group, COLORS, 'p')
      for (const slot of ['helmet', 'facemask', 'chinStrap', 'jersey', 'pants', 'gloves', 'socks', 'shoes'] as const) expect(slots(items), `${group} ${slot}`).toContain(slot)
      expect(items.find((g) => g.slot === 'visor')?.worn).toBe(false)
    }
    const wr = defaultGear('NFL', 'WR', COLORS, 'p')
    expect(slots(wr, true)).toEqual(['helmet', 'facemask', 'chinStrap', 'jersey', 'pants', 'gloves', 'socks', 'shoes'])
  })

  it('fits the NFL kit to the position', () => {
    const mask = (g: string) => defaultGear('NFL', g, COLORS, 'p').find((i) => i.slot === 'facemask')!.defaultVariant
    expect(mask('OL')).toBe('closed')
    expect(mask('DL')).toBe('closed')
    expect(mask('LB')).toBe('standard')
    expect(mask('WR')).toBe('open')
    expect(mask('QB')).toBe('open')
    expect(defaultGear('NFL', 'OL', COLORS, 'p').find((i) => i.slot === 'shoes')!.defaultVariant).toBe('mid')
    expect(defaultGear('NFL', 'QB', COLORS, 'p').find((i) => i.slot === 'gloves')!.worn).toBe(false)
    expect(defaultGear('NFL', 'ST', COLORS, 'p').find((i) => i.slot === 'gloves')!.worn).toBe(false)
    expect(defaultGear('NFL', 'OL', COLORS, 'p').find((i) => i.slot === 'kneeBrace')?.worn).toBe(false)
    expect(defaultGear('NFL', 'WR', COLORS, 'p').find((i) => i.slot === 'kneeBrace')).toBeUndefined()
    const jersey = defaultGear('NFL', 'RB', COLORS, 'p').find((i) => i.slot === 'jersey')!
    expect(jersey.color).toBe(COLORS.primary)
    expect(jersey.accent).toBe(COLORS.secondary)
  })

  it('gives MLB hitters a batting helmet and gloves, and pitchers a cap and glove', () => {
    const hitter = defaultGear('MLB', 'H', COLORS, 'h')
    expect(slots(hitter, true)).toEqual(expect.arrayContaining(['battingHelmet', 'battingGloves', 'jersey', 'pants', 'socks', 'shoes']))
    expect(slots(hitter, false)).toEqual(expect.arrayContaining(['cap', 'fieldingGlove', 'elbowGuard', 'legGuard']))
    const pitcher = defaultGear('MLB', 'P', COLORS, 'p')
    expect(slots(pitcher, true)).toEqual(expect.arrayContaining(['cap', 'fieldingGlove', 'jersey', 'pants', 'socks', 'shoes']))
    expect(slots(pitcher)).not.toContain('battingHelmet')
    expect(slots(pitcher)).not.toContain('battingGloves')
    const twoWay = defaultGear('MLB', 'TWP', COLORS, 't')
    expect(slots(twoWay, true)).toContain('battingHelmet')
    expect(twoWay.find((g) => g.slot === 'fieldingGlove')?.worn).toBe(false)
    expect(hitter.find((g) => g.slot === 'jersey')!.color).toBe(jerseyColor('MLB', COLORS))
  })

  it('puts MLB wear on the right hands for the batting and throwing sides', () => {
    const topHand = (bats: 'L' | 'R') => defaultGear('MLB', 'H', COLORS, 'h', { bats }).find((g) => g.slot === 'battingGloves')!.use.hotspots[0]!.segment
    expect(topHand('L')).toBe('handL')
    expect(topHand('R')).toBe('handR')
    const pocket = (throws: 'L' | 'R') => defaultGear('MLB', 'P', COLORS, 'p', { throws }).find((g) => g.slot === 'fieldingGlove')!.use.hotspots[0]!.segment
    expect(pocket('R')).toBe('handL')
    expect(pocket('L')).toBe('handR')
    const elbow = defaultGear('MLB', 'H', COLORS, 'h', { bats: 'L' }).find((g) => g.slot === 'elbowGuard')!
    expect(elbow.use.hotspots[0]!.segment).toBe('upperArmR')
  })

  it('dresses NBA players in jersey, shorts, socks and shoes, with taller shoes for bigs', () => {
    for (const group of GROUPS.NBA) {
      const items = defaultGear('NBA', group, COLORS, 'b')
      expect(slots(items, true).sort()).toEqual(['jersey', 'shoes', 'shorts', 'socks'])
    }
    const shoe = (g: string) => defaultGear('NBA', g, COLORS, 'b').find((i) => i.slot === 'shoes')!.defaultVariant
    expect(shoe('G')).toBe('low')
    expect(shoe('W')).toBe('mid')
    expect(shoe('B')).toBe('high')
  })

  it('falls back to the league default group for an unknown group, and is deterministic', () => {
    expect(defaultGear('NFL', 'XYZ', COLORS, 'p')).toEqual(defaultGear('NFL', 'RB', COLORS, 'p'))
    expect(defaultGear('MLB', '', COLORS, 'p')).toEqual(defaultGear('MLB', 'H', COLORS, 'p'))
    expect(defaultGear('NBA', 'W', COLORS, 'p')).toEqual(defaultGear('NBA', 'W', COLORS, 'p'))
  })
})

describe('default kit', () => {
  it('measures contrast on the WCAG scale', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5)
    expect(contrastRatio('#123456', '#123456')).toBeCloseTo(1, 5)
    expect(contrastRatio('#fff', '#ffffff')).toBeCloseTo(1, 5)
  })

  it('keeps the number legible on the jersey for every club and the neutral kit', () => {
    for (const t of TEAMS) {
      const kit = defaultKit(t.league, t.colors, '12')
      expect(kit.primary).toBe(t.colors.primary)
      expect(kit.number).toBe('12')
      expect(contrastRatio(kit.trim, jerseyColor(t.league, t.colors)), t.id).toBeGreaterThanOrEqual(3)
    }
    for (const league of LEAGUES) expect(contrastRatio(defaultKit(league, NEUTRAL_COLORS).trim, jerseyColor(league, NEUTRAL_COLORS))).toBeGreaterThanOrEqual(3)
    expect(defaultKit('NFL', COLORS).number).toBe('')
  })
})

describe('default movement', () => {
  it.each(LEAGUES.flatMap((l) => GROUPS[l].map((g) => [l, g] as const)))('%s %s: simulated and physically sensible', (league, group) => {
    const m = defaultMovement(league, group)
    expect(m.quality).toBe('SIMULATED')
    expect(m.basis).not.toBe('')
    const topSpeed = (m.run.strideLengthM * m.run.cadenceSpm) / 60
    expect(topSpeed).toBeGreaterThan(7)
    expect(topSpeed).toBeLessThan(11)
    expect(m.throw.armSlotDeg).toBeGreaterThanOrEqual(0)
    expect(m.throw.armSlotDeg).toBeLessThanOrEqual(90)
    expect(m.shoot.setPointPct).toBeGreaterThan(0)
    expect(m.shoot.setPointPct).toBeLessThan(0.2)
    expect(m.jump.armDrive).toBeGreaterThan(0)
    expect(m.jump.armDrive).toBeLessThanOrEqual(1)
  })

  it('fits movement to the position', () => {
    const run = (l: League, g: string) => defaultMovement(l, g).run
    expect(run('NFL', 'OL').strideLengthM).toBeLessThan(run('NFL', 'WR').strideLengthM)
    expect(run('NFL', 'DL').strideLengthM).toBeLessThan(run('NFL', 'DB').strideLengthM)
    expect(defaultMovement('MLB', 'P').throw.strideLengthPctHeight).toBeGreaterThan(defaultMovement('MLB', 'H').throw.strideLengthPctHeight)
    expect(defaultMovement('MLB', 'P').throw.armSlotDeg).toBeLessThan(90)
    expect(defaultMovement('NFL', 'QB').throw.hipShoulderSeparationDeg).toBeGreaterThan(defaultMovement('NFL', 'OL').throw.hipShoulderSeparationDeg)
    expect(defaultMovement('NBA', 'G').jump.takeoff).toBe('one-foot')
    expect(defaultMovement('NBA', 'B').jump.takeoff).toBe('two-foot')
    expect(defaultMovement('MLB', 'H', { bats: 'L' }).swing.batsLeft).toBe(true)
    expect(defaultMovement('MLB', 'H', { bats: 'S' }).swing.batsLeft).toBe(false)
    expect(defaultMovement('MLB', 'H').swing.batsLeft).toBe(false)
  })

  it('returns a fresh object each call, so editing one athlete never moves another', () => {
    const a = defaultMovement('NFL', 'RB')
    a.run.strideLengthM = 9
    expect(defaultMovement('NFL', 'RB').run.strideLengthM).not.toBe(9)
    expect(defaultMovement('NFL', 'nope')).toEqual(defaultMovement('NFL', 'RB'))
  })
})

describe('parseCsv', () => {
  it('reads a header and rows', () => {
    expect(parseCsv('name,league\nA,NFL\nB,NBA\n')).toEqual([
      { name: 'A', league: 'NFL' },
      { name: 'B', league: 'NBA' },
    ])
  })

  it('handles quoted commas, doubled quotes and line breaks inside quotes', () => {
    const rows = parseCsv('name,position,note\n"Smith, John","WR","He said ""go"""\n"Line\r\nbreak",TE,x')
    expect(rows).toEqual([
      { name: 'Smith, John', position: 'WR', note: 'He said "go"' },
      { name: 'Line\r\nbreak', position: 'TE', note: 'x' },
    ])
  })

  it('accepts CRLF, LF and lone CR line ends, a BOM, and skips empty lines', () => {
    expect(parseCsv('﻿a,b\r\n1,2\r\n\r\n3,4\r\n')).toEqual([
      { a: '1', b: '2' },
      { a: '3', b: '4' },
    ])
    expect(parseCsv('a,b\r1,2\r3,4')).toEqual([
      { a: '1', b: '2' },
      { a: '3', b: '4' },
    ])
  })

  it('pads short rows, drops extra cells, trims headers and keeps empty quoted fields', () => {
    expect(parseCsv(' a , b ,c\n1\n1,2,3,4\n"",,""')).toEqual([
      { a: '1', b: '', c: '' },
      { a: '1', b: '2', c: '3' },
      { a: '', b: '', c: '' },
    ])
  })

  it('is lenient with stray and unclosed quotes instead of throwing', () => {
    expect(parseCsv('a,b\nab"c,d')).toEqual([{ a: 'ab"c', b: 'd' }])
    expect(parseCsv('a,b\n"x"y,z')).toEqual([{ a: 'xy', b: 'z' }])
    expect(parseCsv('a,b\n"open,1\n2')).toEqual([{ a: 'open,1\n2', b: '' }])
  })

  it('returns nothing for empty text or a header alone', () => {
    expect(parseCsv('')).toEqual([])
    expect(parseCsv('name,league\n')).toEqual([])
  })
})

const UNLICENSED: ImportOptions = { provider: 'Club media guide', licensed: false, retrieved: '2026-10-14' }
const LICENSED: ImportOptions = { provider: 'Acme Sports Data', licensed: true, retrieved: '2026-10-14' }

function row(over: Partial<RosterRow> = {}): RosterRow {
  return { name: 'Test Player', league: 'NFL', team: 'IND', position: 'WR', status: 'active', ...over } as RosterRow
}

const CSV = [
  'name,league,team,position,status,number,bats,throws,era,heightIn,weightLb,fortyS,sourceUrl,College',
  'Alex Runner,NFL,IND,WR,active,11,,,,"6-2",205,4.41,https://example.com/alex,State',
  'Sam Slugger,MLB,LAD,SS,rookie,7,L,R,,72,190,,,',
  'Pat Center,NBA,CLE,C,two-way,32,,,,"6\'11""",250,,https://example.com/pat,',
].join('\r\n')

describe('importRoster', () => {
  it('builds complete roster athletes from a CSV file', () => {
    const { athletes, errors, ignoredColumns } = importRoster(parseCsv(CSV), UNLICENSED)
    expect(errors).toEqual([])
    expect(ignoredColumns).toEqual(['College'])
    expect(athletes.map((a) => a.id)).toEqual(['nfl-ind-alex-runner', 'mlb-lad-sam-slugger', 'nba-cle-pat-center'])
    const [wr, ss, c] = athletes as [Athlete, Athlete, Athlete]
    expect(wr).toMatchObject({ league: 'NFL', position: 'WR', positionGroup: 'WR', team: 'Indianapolis Colts', teamId: 'nfl-ind', status: 'active', profile: 'roster', reviewed: '2026-10-14' })
    expect(wr.appearance).toMatchObject({ quality: 'SIMULATED', hair: 'unset' })
    expect(wr.metrics.heightIn?.value).toBe(74)
    expect(wr.metrics.weightLb?.value).toBe(205)
    expect(wr.metrics.fortyS?.value).toBe(4.41)
    expect(wr.kit).toMatchObject({ primary: getTeam('nfl-ind')!.colors.primary, secondary: getTeam('nfl-ind')!.colors.secondary, number: '11' })
    expect(wr.gear.every((g) => g.id.startsWith('nfl-ind-alex-runner-'))).toBe(true)
    expect(wr.gear.map((g) => g.slot)).toContain('chinStrap')
    expect(wr.movement.quality).toBe('SIMULATED')
    expect(wr.seasons).toEqual([])
    expect(wr.injuries).toEqual([])
    expect(wr.media).toEqual([])
    expect(ss).toMatchObject({ positionGroup: 'H', bats: 'L', throws: 'R', status: 'rookie', team: 'Los Angeles Dodgers' })
    expect(ss.movement.swing.batsLeft).toBe(true)
    expect(ss.metrics.fortyS).toBeUndefined()
    expect(c).toMatchObject({ positionGroup: 'B', status: 'two-way', team: 'Cleveland Cavaliers', teamId: 'nba-cle' })
    expect(c.metrics.heightIn?.value).toBe(83)
    expect(c.bats).toBeUndefined()
  })

  it('cites the provider on every figure and passes the data-integrity rules', () => {
    for (const opts of [UNLICENSED, LICENSED]) {
      for (const a of importRoster(parseCsv(CSV), opts).athletes) {
        expect(Object.keys(a.sources)).toHaveLength(1)
        const source = Object.values(a.sources)[0]!
        expect(source.publisher).toBe(opts.provider)
        expect(source.retrieved).toBe('2026-10-14')
        for (const [key, m] of Object.entries(a.metrics) as [string, Measured][]) {
          expect(a.sources[m.sourceId!], key).toBeDefined()
          if (m.quality !== 'VERIFIED') expect(m.note, key).toContain(opts.provider)
        }
        for (const g of a.gear) expect(g.basis).toBe(DEFAULT_KIT_BASIS)
        expect(() => gradesFor(a)).not.toThrow()
      }
    }
  })

  it('marks figures VERIFIED only for a licensed provider with a source URL on the row', () => {
    const licensed = importRoster(parseCsv(CSV), LICENSED).athletes
    const [wr, ss] = licensed as [Athlete, Athlete]
    expect(wr.metrics.fortyS).toMatchObject({ quality: 'VERIFIED', value: 4.41 })
    expect(wr.sources[wr.metrics.fortyS!.sourceId!]!.url).toBe('https://example.com/alex')
    expect(ss.metrics.weightLb).toMatchObject({ quality: 'ESTIMATED' })
    expect(ss.metrics.weightLb!.note).toMatch(/licensed Acme Sports Data feed/)
    expect(ss.metrics.weightLb!.note).toMatch(/no source URL/)
    for (const a of importRoster(parseCsv(CSV), UNLICENSED).athletes) {
      for (const m of Object.values(a.metrics) as Measured[]) {
        expect(m.quality).toBe('ESTIMATED')
        expect(m.note).toMatch(/Club media guide/)
      }
    }
    const unlicensedWr = importRoster(parseCsv(CSV), UNLICENSED).athletes[0]!
    expect(Object.values(unlicensedWr.sources)[0]!.url).toBe('https://example.com/alex')
  })

  it('never labels anything else VERIFIED', () => {
    for (const a of importRoster(parseCsv(CSV), LICENSED).athletes) {
      expect(a.appearance.quality).toBe('SIMULATED')
      expect(a.movement.quality).toBe('SIMULATED')
      expect(a.gear.every((g) => g.quality === 'SIMULATED' && g.use.quality === 'SIMULATED')).toBe(true)
      expect(a.gearHistory.every((h) => h.quality === 'SIMULATED')).toBe(true)
    }
  })

  it('matches headers loosely and accepts common cell formats', () => {
    const rows = [{ Player: 'Ann Lee', LEAGUE: 'nba', 'Team Abbr': 'gs', Pos: 'Point guard', Status: 'Ten day', 'Jersey': '0', THREEPOINTPCT: '41.5%', 'Source URL': '', pointsPerGame: ' 18.2 ' }]
    const { athletes, errors } = importRoster(rows, UNLICENSED)
    expect(errors).toEqual([])
    expect(athletes[0]).toMatchObject({ id: 'nba-gsw-ann-lee', league: 'NBA', teamId: 'nba-gsw', positionGroup: 'G', status: 'ten-day' })
    expect(athletes[0]!.kit.number).toBe('0')
    expect(athletes[0]!.metrics.threePointPct?.value).toBe(41.5)
    expect(athletes[0]!.metrics.pointsPerGame?.value).toBe(18.2)
  })

  it('parses metric cells in the key unit', () => {
    expect(parseMetricValue('rushYards', '1,811')).toBe(1811)
    expect(parseMetricValue('battingAvg', '.310')).toBe(0.31)
    expect(parseMetricValue('avgLaunchAngleDeg', '-2.5')).toBe(-2.5)
    expect(parseMetricValue('heightIn', `6'2"`)).toBe(74)
    expect(parseMetricValue('heightIn', '6-2')).toBe(74)
    expect(parseMetricValue('heightIn', '6 ft 10.5 in')).toBe(82.5)
    expect(parseMetricValue('heightIn', '6-13')).toBeUndefined()
    expect(parseMetricValue('fortyS', '6-2')).toBeUndefined()
    expect(parseMetricValue('catchRatePct', '71%')).toBe(71)
    expect(parseMetricValue('fortyS', '4.4s')).toBeUndefined()
    expect(parseMetricValue('weightLb', '0x10')).toBeUndefined()
    expect(parseMetricValue('weightLb', 'Infinity')).toBeUndefined()
    expect(parseMetricValue('weightLb', '1e999')).toBeUndefined()
    expect(parseMetricValue('weightLb', '12,34')).toBeUndefined()
  })

  it('takes team aliases and names, status aliases and blank teams for free agents', () => {
    const { athletes, errors } = importRoster(
      [
        row({ name: 'One', team: 'JAC', status: 'IR' }),
        row({ name: 'Two', team: 'Colts', status: 'Practice squad' }),
        row({ name: 'Three', team: '', status: 'free-agent' }),
        row({ name: 'Four', league: 'MLB', team: '', position: 'SP', status: 'legend', era: '1990s' }),
      ],
      UNLICENSED,
    )
    expect(errors).toEqual([])
    expect(athletes.map((a) => [a.id, a.status])).toEqual([
      ['nfl-jax-one', 'injured-reserve'],
      ['nfl-ind-two', 'practice-squad'],
      ['nfl-three', 'free-agent'],
      ['mlb-four', 'legend'],
    ])
    const fa = athletes[2]!
    expect(fa.teamId).toBeUndefined()
    expect(fa.team).toBe('Free agent')
    expect(fa.kit.primary).toBe(NEUTRAL_COLORS.primary)
    expect(athletes[3]).toMatchObject({ era: '1990s', positionGroup: 'P', team: 'Legend' })
    expect(athletes[3]!.summary).toContain('1990s')
  })

  it('slugs accented names and gives names without Latin letters a stable id', () => {
    const { athletes } = importRoster([row({ name: 'Ronald Acuña Jr.', league: 'MLB', team: 'ATL', position: 'RF' }), row({ name: '大谷翔平', league: 'MLB', team: 'LAD', position: 'TWP' })], UNLICENSED)
    expect(athletes[0]!.id).toBe('mlb-atl-ronald-acuna-jr')
    expect(athletes[1]!.id).toMatch(/^mlb-lad-[0-9a-z]+$/)
    expect(athletes[1]!.positionGroup).toBe('TWP')
  })

  describe('row errors', () => {
    const errorsFor = (r: RosterRow) => importRoster([r], UNLICENSED)
    const cases: [string, Partial<RosterRow>, RegExp][] = [
      ['unknown league', { league: 'XFL' }, /Unknown league "XFL"/],
      ['missing league', { league: '' }, /Missing league/],
      ['unknown team', { team: 'XYZ' }, /Unknown NFL team "XYZ"/],
      ['team from another league', { team: 'LAD' }, /Unknown NFL team "LAD"/],
      ['missing team for an active player', { team: '' }, /Missing team/],
      ['unknown status', { status: 'retired-ish' }, /Unknown status "retired-ish"/],
      ['missing status', { status: '' }, /Missing status/],
      ['missing name', { name: ' ' }, /Missing name/],
      ['missing position', { position: '' }, /Missing position/],
      ['non-numeric metric', { fortyS: 'fast' }, /fortyS \(40-yard dash\) must be a number; got "fast"/],
      ['bad number', { number: '1A' }, /Number "1A"/],
      ['bad bats', { bats: 'X' }, /Bats "X"/],
      ['bad throws', { throws: 'S' }, /Throws "S"/],
      ['ERA in the era column', { era: '3.45' }, /earned run average goes in pitchingEra/],
      ['http source URL', { sourceUrl: 'http://example.com/p' }, /must be a full https:\/\/ address/],
      ['garbage source URL', { sourceUrl: 'not a url' }, /must be a full https:\/\/ address/],
    ]
    it.each(cases)('%s', (_label, over, message) => {
      const { athletes, errors } = errorsFor(row(over))
      expect(athletes).toEqual([])
      expect(errors).toHaveLength(1)
      expect(errors[0]!.row).toBe(1)
      expect(errors[0]!.message).toMatch(message)
    })

    it('reports every problem on a row, and keeps importing the good rows', () => {
      const { athletes, errors } = importRoster([row({ name: 'Good' }), row({ name: 'Bad', league: 'NFL', team: 'XYZ', status: 'nope', weightLb: 'heavy' }), row({ name: 'Also good', team: 'BUF' })], UNLICENSED)
      expect(athletes.map((a) => a.name)).toEqual(['Good', 'Also good'])
      expect(errors.map((e) => e.row)).toEqual([2, 2, 2])
      expect(errors.map((e) => e.message).join(' ')).toMatch(/status "nope".*team "XYZ".*weightLb/)
    })

    it('rejects a duplicate of an earlier row', () => {
      const { athletes, errors } = importRoster([row(), row({ name: 'Other' }), row()], UNLICENSED)
      expect(athletes).toHaveLength(2)
      expect(errors).toEqual([{ row: 3, message: 'Duplicate of row 1: same name, league and team.' }])
    })

    it('reports missing required columns once for the whole file', () => {
      const { athletes, errors } = importRoster([{ name: 'A', league: 'NFL', team: 'IND', position: 'WR' }, { name: 'B', league: 'NFL', team: 'IND', position: 'TE' }], UNLICENSED)
      expect(athletes).toEqual([])
      expect(errors).toEqual([{ row: 0, message: 'Missing required column "status".' }])
    })

    it('rejects a blank provider or a malformed retrieved date for the whole file', () => {
      expect(importRoster([row()], { ...UNLICENSED, provider: '  ' }).errors).toEqual([{ row: 0, message: expect.stringMatching(/provider/) }])
      expect(importRoster([row()], { ...UNLICENSED, retrieved: '14/10/2026' }).errors[0]).toMatchObject({ row: 0 })
      expect(importRoster([row()], { ...UNLICENSED, retrieved: '14/10/2026' }).athletes).toEqual([])
    })

    it('skips blank rows silently but keeps row numbers aligned with the input', () => {
      const { athletes, errors } = importRoster([row(), { name: '', league: ' ', team: '', position: '', status: '' }, row({ name: 'X', league: 'CFL' })], UNLICENSED)
      expect(athletes).toHaveLength(1)
      expect(errors).toEqual([{ row: 3, message: expect.stringMatching(/Unknown league "CFL"/) }])
    })

    it('never throws on odd input', () => {
      const odd = [{}, { name: 'A' }, { name: 'B', league: 'NBA', team: 'CLE', position: 'G', status: 'active', heightIn: '∞' }] as RosterRow[]
      expect(() => importRoster(odd, UNLICENSED)).not.toThrow()
      expect(importRoster([], UNLICENSED)).toEqual({ athletes: [], errors: [], ignoredColumns: [] })
      // A JSON feed that hands over numbers and nulls despite the string type.
      const loose = [{ ...row(), weightLb: 212, number: 9, era: null }] as unknown as RosterRow[]
      const { athletes, errors } = importRoster(loose, UNLICENSED)
      expect(errors).toEqual([])
      expect(athletes[0]!.metrics.weightLb?.value).toBe(212)
      expect(athletes[0]!.kit.number).toBe('9')
    })
  })

  it('accepts every roster status', () => {
    const rows = ROSTER_STATUSES.map((status, i) => row({ name: `P${i}`, status }))
    const { athletes, errors } = importRoster(rows, UNLICENSED)
    expect(errors).toEqual([])
    expect(athletes.map((a) => a.status)).toEqual(ROSTER_STATUSES)
  })

  it('is deterministic and produces plain, cloneable data', () => {
    const a = importRoster(parseCsv(CSV), LICENSED)
    const b = importRoster(parseCsv(CSV), LICENSED)
    expect(a).toEqual(b)
    expect(structuredClone(a.athletes)).toEqual(a.athletes)
    expect(JSON.parse(JSON.stringify(a.athletes))).toEqual(a.athletes)
  })

  it('does not share gear or movement objects between athletes', () => {
    const { athletes } = importRoster([row({ name: 'A' }), row({ name: 'B' })], UNLICENSED)
    const [x, y] = athletes as [Athlete, Athlete]
    x.movement.run.strideLengthM = 1
    x.gear[0]!.use.hotspots.push({ segment: 'head', along: 0, face: 'top', intensity: 1, label: 'test' })
    expect(y.movement.run.strideLengthM).not.toBe(1)
    expect(y.gear[0]!.use.hotspots.some((h) => h.label === 'test')).toBe(false)
  })
})

it('keeps team objects consistent with the lookup helpers', () => {
  for (const t of TEAMS as Team[]) {
    expect(getTeam(t.id)).toBe(t)
    expect(getTeamByAbbr(t.league, t.abbr)).toBe(t)
    for (const alias of t.aliases) expect(getTeamByAbbr(t.league, alias.toLowerCase())).toBe(t)
  }
})
