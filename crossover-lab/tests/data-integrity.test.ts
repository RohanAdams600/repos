import { describe, expect, it } from 'vitest'
import { BUILT_IN } from '../src/data/roster'
import type { Athlete, Measured } from '../src/data/types'

const ISO = /^\d{4}(-\d{2}(-\d{2})?)?$/

function allMeasured(a: Athlete): [string, Measured][] {
  const out: [string, Measured][] = Object.entries(a.metrics).map(([k, m]) => [`metrics.${k}`, m as Measured])
  for (const s of a.seasons) {
    if (s.games) out.push([`${s.season}.games`, s.games])
    for (const [k, m] of Object.entries(s.metrics)) out.push([`${s.season}.${k}`, m as Measured])
  }
  for (const p of a.pitches ?? []) for (const [k, m] of Object.entries(p)) if (typeof m === 'object') out.push([`pitch.${p.type}.${k}`, m as Measured])
  return out
}

describe.each(BUILT_IN.map((a) => [a.name, a] as const))('%s', (_name, a) => {
  it('labels every figure, and every VERIFIED figure cites a source on file', () => {
    for (const [path, m] of allMeasured(a)) {
      expect(['VERIFIED', 'ESTIMATED', 'SIMULATED'], path).toContain(m.quality)
      expect(Number.isFinite(m.value), path).toBe(true)
      if (m.quality === 'VERIFIED') {
        expect(m.sourceId, path).toBeTruthy()
        expect(a.sources[m.sourceId!], `${path} -> ${m.sourceId}`).toBeDefined()
      } else {
        expect(m.note ?? '', `${path} needs a note saying how it was derived`).not.toBe('')
      }
      if (m.asOf) expect(m.asOf, path).toMatch(ISO)
    }
  })

  it('dates every source and gives online sources a URL', () => {
    for (const s of Object.values(a.sources)) {
      expect(s.retrieved).toMatch(ISO)
      if (s.published) expect(s.published).toMatch(ISO)
      if (s.id !== 'reference-photos') expect(s.url).toMatch(/^https:\/\//)
    }
  })

  it('cites source and date on every media item, and never rehosts', () => {
    for (const m of a.media) {
      expect(m.source).not.toBe('')
      expect(m.date).toMatch(ISO)
      expect(['published', 'accessed']).toContain(m.dateKind)
      expect(m.url).toMatch(/^https:\/\//)
      expect(['link-out', 'licensed-api']).toContain(m.delivery)
    }
  })

  it('backs every injury with a source on file', () => {
    for (const i of a.injuries) {
      expect(a.sources[i.sourceId], i.title).toBeDefined()
      expect(i.date).toMatch(ISO)
    }
  })

  it('gives every gear item a basis, a label and sane hotspots', () => {
    for (const g of a.gear) {
      expect(g.basis).not.toBe('')
      expect(g.use.usagePct).toBeGreaterThanOrEqual(0)
      expect(g.use.usagePct).toBeLessThanOrEqual(100)
      for (const h of g.use.hotspots) {
        expect(h.intensity).toBeGreaterThanOrEqual(0)
        expect(h.intensity).toBeLessThanOrEqual(1)
        expect(h.along).toBeGreaterThanOrEqual(0)
        expect(h.along).toBeLessThanOrEqual(1)
      }
    }
  })

  it('uses generic kit colors only (hex values, no logo assets)', () => {
    expect(a.kit.primary).toMatch(/^#[0-9a-f]{6}$/i)
    expect(JSON.stringify(a.gear)).not.toMatch(/\.(png|svg|jpe?g|webp)/i)
  })
})

it('has the three demo athletes, one per league', () => {
  expect(BUILT_IN.map((a) => a.league).sort()).toEqual(['MLB', 'NBA', 'NFL'])
})

it('keeps the NFL kit observations from the reference photos', () => {
  const jt = BUILT_IN.find((a) => a.league === 'NFL')!
  expect(jt.kit.number).toBe('28')
  expect(jt.gear.find((g) => g.slot === 'socks')?.name).toMatch(/blue/i)
  expect(jt.gear.filter((g) => g.basis.startsWith('Reference photo')).length).toBeGreaterThan(5)
})
