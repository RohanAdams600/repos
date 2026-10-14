import { describe, expect, it } from 'vitest'
import { allAthletes, BUILT_IN, normalize, STANDOUTS } from '../src/data/roster'
import { enrich } from '../src/data/standouts/profiles'
import { RESEARCH } from '../src/data/standouts/research'
import { getTeam } from '../src/data/teams'
import { jonathanTaylor } from '../src/data/athletes/jonathan-taylor'
import type { Athlete, Measured } from '../src/data/types'

function measured(a: Athlete): [string, Measured][] {
  const out: [string, Measured][] = Object.entries(a.metrics).map(([k, m]) => [k, m as Measured])
  for (const s of a.seasons) for (const [k, m] of Object.entries(s.metrics)) out.push([`${s.season}.${k}`, m as Measured])
  return out
}

describe('standout profiles from the research log', () => {
  it('exist for every researched athlete without a full profile, with unique ids', () => {
    const builtIn = new Set(BUILT_IN.map((a) => a.id))
    expect(STANDOUTS.length).toBe(RESEARCH.filter((r) => !builtIn.has(r.id)).length)
    const ids = allAthletes().map((a) => a.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it.each(STANDOUTS.map((a) => [a.name, a] as const))('%s: only sourced figures, labelled, no likeness', (_n, a) => {
    expect(a.profile).toBe('standout')
    expect(a.appearance.quality).toBe('SIMULATED')
    expect(a.appearance.hair).toBe('unset')
    expect(a.appearance.scan).toBeUndefined()
    if (a.teamId) expect(getTeam(a.teamId)?.league).toBe(a.league)
    for (const [path, m] of measured(a)) {
      // The research never invents numbers: no simulated values, every figure cites a source.
      expect(m.quality, path).not.toBe('SIMULATED')
      expect(m.sourceId, path).toBeTruthy()
      const src = a.sources[m.sourceId!]
      expect(src, path).toBeDefined()
      expect(src!.url, path).toMatch(/^https:\/\//)
      expect(m.note ?? '', path).not.toBe('')
    }
    for (const g of a.gear) expect(g.quality).toBe('SIMULATED')
    expect(a.movement.quality).toBe('SIMULATED')
  })

  it('marks a figure VERIFIED only when an independent second publisher confirmed it', () => {
    for (const r of RESEARCH) {
      for (const f of r.facts) {
        if (f.quality === 'VERIFIED') {
          expect(f.confirmedBy, `${r.name} ${f.metric}`).toBeDefined()
          expect(f.confirmedBy!.url).not.toBe(f.source.url)
        } else {
          expect(f.note).toMatch(/not marked VERIFIED|disagree/)
        }
      }
    }
  })

  it('only ever quotes rank wording that came from a source', () => {
    const claims = new Set(RESEARCH.flatMap((r) => r.facts.map((f) => f.rank).filter((x): x is string => !!x)))
    for (const a of STANDOUTS) for (const [path, m] of measured(a)) if (m.rank) expect(claims.has(m.rank), path).toBe(true)
  })

  it('records draft recognition only from the facts', () => {
    for (const a of STANDOUTS) {
      const r = RESEARCH.find((x) => x.id === a.id)!
      const pick = r.facts.find((f) => f.metric === 'draftPick')
      if (pick) expect(a.recognition?.draftPick).toBe(pick.value)
      else expect(a.recognition?.draftPick).toBeUndefined()
    }
  })
})

describe('enriching full profiles', () => {
  it('adds researched figures a profile lacks and never overwrites curated ones', () => {
    const taylor = enrich(jonathanTaylor)
    for (const [k, m] of Object.entries(jonathanTaylor.metrics)) expect(taylor.metrics[k as keyof typeof taylor.metrics]).toEqual(m)
    const research = RESEARCH.find((r) => r.id === 'jonathan-taylor')
    if (research?.facts.some((f) => f.metric === 'topSpeedMph') && !jonathanTaylor.metrics.topSpeedMph) {
      expect(taylor.metrics.topSpeedMph?.value).toBe(research.facts.find((f) => f.metric === 'topSpeedMph')!.value)
      expect(taylor.sources[taylor.metrics.topSpeedMph!.sourceId!]).toBeDefined()
    }
  })
})

describe('normalize', () => {
  it('fills status, profile and appearance on athletes saved before they existed', () => {
    const old = { ...BUILT_IN[0]!, custom: true } as Partial<Athlete>
    delete old.status
    delete old.profile
    delete old.appearance
    const a = normalize(old as Athlete)
    expect(a.status).toBe('active')
    expect(a.profile).toBe('full')
    expect(a.appearance.quality).toBe('SIMULATED')
  })
})
