import type { Athlete, League, RosterStatus } from '../data/types'
import { allAthletes } from '../data/roster'
import { divisions, teamsByLeague, type Team } from '../data/teams'
import { h } from './dom'

/**
 * The left rail: league, then team, then athlete. Every club in the three leagues is listed
 * (from teams.ts); under each club, the athletes on file. Clubs with nobody on file say so and
 * point to the roster import, rather than inventing a roster. Legends, free agents and prospects
 * without a club get their own groups.
 */
export const LEAGUES: League[] = ['NFL', 'MLB', 'NBA']

export const STATUS_LABEL: Record<RosterStatus, string> = {
  active: 'Active',
  'practice-squad': 'Practice squad',
  'two-way': 'Two-way',
  'ten-day': '10-day',
  'injured-reserve': 'Injured reserve',
  'free-agent': 'Free agent',
  legend: 'Legend',
  prospect: 'Prospect',
  rookie: 'Rookie',
}

/** Statuses that exist in each league (practice squads are NFL; two-way and 10-day are NBA). */
export const LEAGUE_STATUSES: Record<League, RosterStatus[]> = {
  NFL: ['active', 'rookie', 'practice-squad', 'injured-reserve', 'free-agent', 'prospect', 'legend'],
  MLB: ['active', 'rookie', 'injured-reserve', 'free-agent', 'prospect', 'legend'],
  NBA: ['active', 'rookie', 'two-way', 'ten-day', 'injured-reserve', 'free-agent', 'prospect', 'legend'],
}

const PROFILE_LABEL: Record<Athlete['profile'], string> = { full: 'Full', standout: 'Standout', roster: 'Roster' }

interface RailState {
  league: League
  query: string
  status: RosterStatus | 'all'
  open: Set<string>
}

const STATE_KEY = 'crossover-lab:rail:v1'

function loadState(): RailState {
  try {
    const raw = sessionStorage.getItem(STATE_KEY)
    if (raw) {
      const p = JSON.parse(raw) as { league?: League; status?: RosterStatus | 'all'; open?: string[] }
      return { league: LEAGUES.includes(p.league as League) ? (p.league as League) : 'NFL', query: '', status: p.status ?? 'all', open: new Set(p.open ?? []) }
    }
  } catch {
    // Storage blocked: the rail starts fresh each visit.
  }
  return { league: 'NFL', query: '', status: 'all', open: new Set() }
}

function saveState(s: RailState): void {
  try {
    sessionStorage.setItem(STATE_KEY, JSON.stringify({ league: s.league, status: s.status, open: [...s.open] }))
  } catch {
    // Not critical.
  }
}

/** Pure filter, exported for tests: athletes of a league matching a query and a status. */
export function filterAthletes(list: readonly Athlete[], league: League, query: string, status: RosterStatus | 'all'): Athlete[] {
  const q = query.trim().toLowerCase()
  return list.filter((a) => {
    if (a.league !== league) return false
    if (status !== 'all' && a.status !== status) return false
    if (!q) return true
    return [a.name, a.team, a.position, a.positionGroup, STATUS_LABEL[a.status] ?? ''].some((x) => x.toLowerCase().includes(q))
  })
}

/** Group athletes under their clubs; those without a club go to Legends, Free agents or Prospects. */
export function groupByTeam(list: readonly Athlete[], league: League): { byTeam: Map<string, Athlete[]>; unattached: Map<string, Athlete[]> } {
  const byTeam = new Map<string, Athlete[]>()
  const unattached = new Map<string, Athlete[]>()
  const ids = new Set(teamsByLeague(league).map((t) => t.id))
  for (const a of list) {
    if (a.teamId && ids.has(a.teamId) && a.status !== 'legend') {
      byTeam.set(a.teamId, [...(byTeam.get(a.teamId) ?? []), a])
      continue
    }
    const group = a.status === 'legend' ? 'Legends' : a.status === 'prospect' ? 'Prospects' : a.status === 'free-agent' ? 'Free agents' : 'Other clubs and unattached'
    unattached.set(group, [...(unattached.get(group) ?? []), a])
  }
  for (const l of [...byTeam.values(), ...unattached.values()]) l.sort((x, y) => x.name.localeCompare(y.name))
  return { byTeam, unattached }
}

export class Rail {
  readonly el: HTMLElement
  private readonly body: HTMLElement
  private readonly state = loadState()
  private current: string | null = null

  constructor() {
    this.body = h('div', { class: 'rail-body' })
    this.el = h('nav', { class: 'rail', 'aria-label': 'Leagues, teams and athletes', id: 'rail' }, this.body)
  }

  /** Re-render, highlighting the athlete on screen (and switching to their league). */
  render(currentId?: string | null): void {
    if (currentId !== undefined) this.current = currentId
    const all = allAthletes()
    const cur = this.current ? all.find((a) => a.id === this.current) : undefined
    if (cur && currentId) {
      this.state.league = cur.league
      if (cur.teamId) this.state.open.add(cur.teamId)
    }
    const s = this.state
    const list = filterAthletes(all, s.league, s.query, s.status)
    const { byTeam, unattached } = groupByTeam(list, s.league)
    const searching = s.query.trim().length > 0 || s.status !== 'all'

    const leagueSeg = h(
      'div',
      { class: 'seg rail-leagues', role: 'group', 'aria-label': 'League' },
      LEAGUES.map((l) =>
        h(
          'button',
          {
            type: 'button',
            'aria-pressed': String(l === s.league),
            onclick: () => {
              s.league = l
              if (!LEAGUE_STATUSES[l].includes(s.status as RosterStatus)) s.status = 'all'
              saveState(s)
              this.render()
            },
          },
          l,
        ),
      ),
    )
    const search = h('input', {
      type: 'search',
      class: 'rail-search',
      placeholder: 'Search name, team, position',
      'aria-label': 'Search athletes',
      value: s.query,
      oninput: (e: Event) => {
        s.query = (e.target as HTMLInputElement).value
        this.render()
        requestAnimationFrame(() => {
          const el = this.el.querySelector<HTMLInputElement>('.rail-search')
          if (el) {
            el.focus()
            el.setSelectionRange(el.value.length, el.value.length)
          }
        })
      },
    })
    const statusSelect = h(
      'select',
      {
        'aria-label': 'Roster status',
        class: 'rail-status',
        onchange: (e: Event) => {
          s.status = (e.target as HTMLSelectElement).value as RosterStatus | 'all'
          saveState(s)
          this.render()
        },
      },
      h('option', { value: 'all', selected: s.status === 'all' }, 'All statuses'),
      LEAGUE_STATUSES[s.league].map((st) => h('option', { value: st, selected: s.status === st }, STATUS_LABEL[st])),
    )

    const athleteLink = (a: Athlete) =>
      h(
        'li',
        null,
        h(
          'a',
          { href: `#a.${a.id}.overview`, class: 'rail-athlete', 'aria-current': a.id === this.current ? 'page' : null },
          h('span', { class: 'rail-name' }, a.name),
          h('span', { class: 'rail-meta' }, `${a.positionGroup === 'TWP' ? 'Two-way' : a.position} · ${STATUS_LABEL[a.status] ?? a.status}${a.era ? ` · ${a.era}` : ''}`),
          h('span', { class: `rail-badge p-${a.profile}`, title: `${PROFILE_LABEL[a.profile]} profile` }, PROFILE_LABEL[a.profile]),
        ),
      )

    const teamBlock = (t: Team) => {
      const people = byTeam.get(t.id) ?? []
      if (searching && people.length === 0) return null
      const open = searching || s.open.has(t.id)
      return h(
        'details',
        {
          class: 'rail-team',
          open,
          ontoggle: (e: Event) => {
            if ((e.target as HTMLDetailsElement).open) s.open.add(t.id)
            else s.open.delete(t.id)
            saveState(s)
          },
        },
        h('summary', null, h('span', { class: 'swatch', style: { background: t.colors.primary }, 'aria-hidden': 'true' }), h('span', { class: 'grow' }, t.fullName), h('span', { class: 'count', 'aria-label': `${people.length} on file` }, people.length)),
        people.length
          ? h('ul', null, people.map(athleteLink))
          : h('p', { class: 'rail-empty' }, 'No athletes on file for this club yet. ', h('a', { href: '#import' }, 'Import a roster'), ' from a licensed file or feed.'),
      )
    }

    const groups = [...unattached.entries()].sort(([a], [b]) => a.localeCompare(b))
    const parts: (HTMLElement | null)[] = [
      h('div', { class: 'rail-head' }, leagueSeg, search, statusSelect, h('p', { class: 'rail-count' }, `${list.length} ${s.league} athletes on file${searching ? ' match' : ''}`)),
      groups.length
        ? h(
            'section',
            { class: 'rail-groups' },
            groups.map(([label, people]) =>
              h('details', { class: 'rail-team', open: true }, h('summary', null, h('span', { class: 'grow' }, label), h('span', { class: 'count' }, people.length)), h('ul', null, people.map(athleteLink))),
            ),
          )
        : null,
      ...divisions(s.league).map((d) => {
        const blocks = d.teams.map(teamBlock).filter((x): x is HTMLDetailsElement => x !== null)
        if (!blocks.length) return null
        return h('section', { class: 'rail-division' }, h('h2', null, `${d.conference} · ${d.division}`), blocks)
      }),
      h('div', { class: 'rail-foot' }, h('a', { href: '#import' }, 'Import a roster'), ' · ', h('a', { href: '#methodology' }, 'Methodology'), h('p', { class: 'legal' }, LEGAL)),
    ]
    this.body.replaceChildren(...parts.filter((x): x is HTMLElement => x !== null))
  }
}

export const LEGAL = "Unofficial fan/analytics tool, not affiliated with the NFL, MLB, NBA, teams, or players' associations."
