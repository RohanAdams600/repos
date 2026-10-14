import { writeFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { allAthletes } from '../src/data/roster'
import { RESEARCH, RESEARCH_RETRIEVED } from '../src/data/standouts/research'
import { buildStandouts, SECTION_CAP } from '../src/standouts/engine'
import type { League } from '../src/data/types'

/**
 * Weekly standouts refresh (run by .github/workflows/crossover-lab-standouts.yml every Monday):
 * rebuilds every league's lists for the current week from the figures on file, checks the rules
 * still hold, writes a JSON snapshot for the run's artifacts, and warns when the research log is
 * getting old so someone re-runs the research and the second-source check.
 */
const STALE_DAYS = 35

it('rebuilds this week’s standouts and checks the rules', () => {
  const today = new Date()
  const leagues: League[] = ['NFL', 'MLB', 'NBA']
  const pages = leagues.map((league) => buildStandouts(allAthletes(), { league, today }))
  for (const page of pages) {
    for (const s of page.sections) {
      expect(s.entries.length).toBeLessThanOrEqual(SECTION_CAP)
      for (const e of s.entries) {
        // Simulated values never qualify; every entry says how many it was ranked against.
        expect(e.quality).not.toBe('SIMULATED')
        expect(e.rankText).toMatch(/\d/)
      }
    }
  }
  const ageDays = Math.floor((today.getTime() - Date.parse(RESEARCH_RETRIEVED)) / 86_400_000)
  const verified = RESEARCH.flatMap((r) => r.facts).filter((f) => f.quality === 'VERIFIED').length
  const total = RESEARCH.flatMap((r) => r.facts).length
  const out = process.env.STANDOUTS_OUT ?? 'standouts-week.json'
  writeFileSync(out, JSON.stringify({ week: pages[0]!.generatedWeek, researchRetrieved: RESEARCH_RETRIEVED, researchAgeDays: ageDays, facts: { total, verified }, pages }, null, 1))
  console.log(`Standouts for the week of ${pages[0]!.generatedWeek}: ${pages.map((p) => `${p.league} ${p.sections.reduce((n, s) => n + s.entries.length, 0)} entries`).join(', ')}. Research log ${ageDays} days old (${verified}/${total} figures verified).`)
  if (ageDays > STALE_DAYS) console.log(`::warning title=Standouts research is ${ageDays} days old::Re-run the research and second-source check, then regenerate with scripts/gen-research.py.`)
})
