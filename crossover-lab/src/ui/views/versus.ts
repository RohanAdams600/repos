import * as THREE from 'three'
import type { Athlete, Quality } from '../../data/types'
import { weakest } from '../../data/types'
import { allAthletes, getAthlete } from '../../data/roster'
import { MPH_TO_MS } from '../../data/metrics'
import { makeBatter, makePitcher, outcomeShares, PLATE_HALF_WIDTH, simulateDuel, summarize, simulatePlateAppearance, type PitchEvent } from '../../sim/atbat'
import { AGILITY_LABEL, agilityContest, JUMP_LABEL, jumpContest, LIFT_LABEL, liftContest, liftValue, rankDescending, type AgilityEvent, type JumpEvent, type LiftEvent, type Ranked } from '../../sim/events'
import { normalizeSpeed } from '../../sim/normalize'
import { createRng } from '../../sim/rng'
import { freeThrowContest, shotChartChallenge, threePointContest, ZONES, type Shot } from '../../sim/shooting'
import { accuracyContest, BALLS, throwContest, type Ball } from '../../sim/throwing'
import { AtBatStage, ShootingStage } from '../../stage/duel-stages'
import type { TimelineStage } from '../../stage/timeline'
import { AgilityStage, JumpStage, LiftStage, SprintStage, ThrowStage } from '../../stage/versus-stages'
import type { EnvKind, EnvOptions } from '../../three/env'
import { qualityChip, seg, selectField } from '../components'
import type { AppContext, View } from '../context'
import { copyText, h, mount, s, toast } from '../dom'
import { athleteColor } from '../settings'
import { decodeMatchup, encodeMatchup, type Matchup, type Mode } from '../share'

const MODE_LABEL: Record<Mode, string> = { sprint: 'Sprint', jump: 'Jumps', lift: 'Lift-off', arm: 'Arm strength', atbat: 'At-bat', shoot: 'Shooting', agility: 'Agility' }

let last: Matchup = { v: 1, ids: ['jonathan-taylor', 'shohei-ohtani', 'donovan-mitchell'], mode: 'sprint', opts: { distance: '40yd' }, seed: 20261014 }

interface Row {
  athlete: Athlete
  display: string
  quality: Quality
  sortValue: number
  basis?: string
  normalized?: { display: string; quality: Quality; method: string; value: number }
}

interface Built {
  stage: TimelineStage
  env: [EnvKind, EnvOptions?]
  rows: Row[]
  /** Higher sortValue wins unless set. */
  ascending?: boolean
  live?: (t: number) => { label: string; big: string; sub: string }[]
  extra?: HTMLElement[]
  after?: () => void
  /** Page heading when the default "A vs B vs C" does not fit (the at-bat has two roles). */
  title?: string
}

export function versusView(ctx: AppContext, code?: string): View {
  if (code) {
    const decoded = decodeMatchup(code)
    if (decoded) last = decoded
    else toast('That matchup link is not valid; showing the last matchup instead.')
  }
  const root = h('div', { class: 'stack', style: { gap: '20px' } })
  let stopLive: (() => void) | null = null

  const update = (change: Partial<Matchup>, reseed = false) => {
    last = { ...last, ...change, opts: { ...last.opts, ...(change.opts ?? {}) }, seed: reseed ? (Math.random() * 2 ** 31) >>> 0 : last.seed }
    build()
  }

  const build = () => {
    stopLive?.()
    stopLive = null
    const m = last
    const roster = allAthletes()
    let athletes = m.ids.map((id) => getAthlete(id)).filter((a): a is Athlete => !!a)
    if (athletes.length < 2) athletes = roster.slice(0, 2)
    const leagues = new Set(athletes.map((a) => a.league))
    const cross = leagues.size > 1

    const picker = h(
      'div',
      { class: 'picker', role: 'group', 'aria-label': 'Athletes in this matchup' },
      roster.map((a, i) => {
        const on = athletes.some((x) => x.id === a.id)
        return h(
          'button',
          {
            class: 'pick',
            type: 'button',
            'aria-pressed': String(on),
            style: { '--c': athleteColor(i) },
            onclick: () => {
              const ids = on ? m.ids.filter((x) => x !== a.id) : [...m.ids, a.id]
              if (ids.length < 2) return toast('Pick at least two athletes.')
              if (ids.length > 4) return toast('Four athletes at most.')
              update({ ids })
            },
          },
          h('span', { class: 'dot', 'aria-hidden': 'true' }),
          a.name,
          h('span', { class: 'muted' }, a.league),
        )
      }),
    )

    const modes = seg((Object.keys(MODE_LABEL) as Mode[]).map((x) => ({ value: x, label: MODE_LABEL[x] })), m.mode, (mode) => update({ mode, opts: {} }), 'Contest')

    const built = buildMode(ctx, m, athletes)
    ctx.viewer.setEnvironment(built.env[0], built.env[1] ?? {})
    ctx.viewer.setController(built.stage)
    ctx.hud.bind(built.stage, { transport: true, record: true })
    built.stage.rigs.forEach((rig, i) => {
      const color = athleteColor(roster.findIndex((a) => a.id === rig.athlete.id))
      ctx.viewer.addLabel(`v${i}`, h('div', { style: { '--swatch': color } }, rig.athlete.name.split(' ').slice(-1)[0]!), (o) => {
        rig.jointWorld('head', o)
        o.y += 0.32
        return o
      })
    })

    const sorted = [...built.rows].sort((a, b) => (built.ascending ? a.sortValue - b.sortValue : b.sortValue - a.sortValue))
    const useNorm = m.opts.normalize === true && sorted.every((r) => r.normalized)
    const ranked = useNorm ? [...sorted].sort((a, b) => b.normalized!.value - a.normalized!.value) : sorted
    const table = h(
      'div',
      { class: 'table-wrap' },
      h(
        'table',
        { class: 'data' },
        h('thead', null, h('tr', null, h('th', null, '#'), h('th', null, 'Athlete'), h('th', { class: 'n' }, 'Result'), sorted.some((r) => r.normalized) ? h('th', { class: 'n' }, 'Size-adjusted') : null, h('th', null, 'Data'))),
        h(
          'tbody',
          null,
          ranked.map((r, i) =>
            h(
              'tr',
              { class: i === 0 ? 'lead' : '' },
              h('td', null, h('span', { class: 'rank' }, i + 1)),
              h('td', null, h('span', { class: 'swatch', style: { background: athleteColor(roster.findIndex((a) => a.id === r.athlete.id)), borderRadius: '50%' } }), ' ', r.athlete.name, r.basis ? h('div', { class: 'src' }, r.basis) : null),
              h('td', { class: 'n' }, r.display),
              sorted.some((x) => x.normalized) ? h('td', { class: 'n' }, r.normalized ? r.normalized.display : '–') : null,
              h('td', null, qualityChip(r.quality), r.normalized && useNorm ? [' ', qualityChip(r.normalized.quality)] : null),
            ),
          ),
        ),
      ),
    )

    const liveEl = h('div', { class: 'live', 'aria-live': 'off' })
    if (built.live) {
      const draw = () => {
        const cells = built.live!(built.stage.time)
        liveEl.replaceChildren(
          ...cells.map((c, i) =>
            h('div', { class: 'cell', style: { '--c': athleteColor(roster.findIndex((a) => a.id === built.stage.rigs[i]?.athlete.id)) } }, h('span', { class: 'eyebrow' }, c.label), h('span', { class: 'big' }, c.big), h('span', { class: 'src num' }, c.sub)),
          ),
        )
      }
      let acc = 0
      stopLive = ctx.viewer.onFrame((dt) => {
        acc += Math.max(dt, 1 / 60)
        if (acc < 0.1) return
        acc = 0
        draw()
      })
      draw()
    }

    const shareInput = h('input', { type: 'text', id: 'share-code', readonly: true, value: encodeMatchup(m), 'aria-label': 'Matchup code', style: { flex: '1 1 200px', fontFamily: 'var(--mono)', fontSize: '12px' } })
    const loadInput = h('input', { type: 'text', id: 'load-code', placeholder: 'Paste a matchup link or code', 'aria-label': 'Matchup link or code to load', style: { flex: '1 1 200px' } })
    const custom = athletes.some((a) => a.custom)
    mount(root,
      h('div', { class: 'stack', style: { gap: '6px' } }, h('span', { class: 'eyebrow' }, 'Head-to-head · any sport'), h('h1', null, built.title ?? `${MODE_LABEL[m.mode]}: ${athletes.map((a) => a.name.split(' ').slice(-1)[0]).join(' vs ')}`)),
      h('section', { class: 'section' }, h('h2', null, 'Athletes'), picker),
      h('section', { class: 'section' }, h('h2', null, 'Contest'), modes, h('div', { class: 'row' }, ...(built.extra ?? []))),
      cross ? h('p', { class: 'note' }, h('strong', null, 'Cross-sport matchup. '), 'Each athlete is measured in their own sport; conversions between sports and size adjustments are estimates. ', qualityChip('ESTIMATED')) : null,
      built.live ? h('section', { class: 'section' }, h('h2', null, 'Live'), liveEl) : null,
      h('section', { class: 'section' }, h('div', { class: 'section-head' }, h('h2', null, 'Result'), h('button', { class: 'btn ghost', type: 'button', onclick: () => update({}, true) }, 'Run again with a new seed')), table),
      h('p', { class: 'note' }, h('strong', null, 'Fairness note. '), 'Results are simulated from the data on file, with the labels shown. They are not predictions of what would happen if these athletes met.'),
      h(
        'section',
        { class: 'section' },
        h('h2', null, 'Save and share'),
        h(
          'div',
          { class: 'row' },
          shareInput,
          h(
            'button',
            {
              class: 'btn',
              type: 'button',
              onclick: async () => {
                const link = `${location.href.split('#')[0]}#m.${encodeMatchup(m)}`
                const ok = await copyText(link, shareInput)
                toast(ok ? 'Link copied' : 'Select the code and copy it')
              },
            },
            'Copy link',
          ),
          h('button', { class: 'btn ghost', type: 'button', onclick: () => void ctx.hud.record() }, 'Record clip'),
        ),
        custom ? h('p', { class: 'src' }, 'This matchup includes a custom athlete, who only exists in the browser that built it. Others opening the link will see the built-in athletes instead.') : null,
        h(
          'form',
          {
            class: 'row',
            onsubmit: (e: Event) => {
              e.preventDefault()
              const decoded = decodeMatchup((loadInput as HTMLInputElement).value.split('#').pop() ?? '')
              if (!decoded) return toast('That code is not a matchup. Copy it again from Save and share.')
              last = decoded
              build()
              toast('Matchup loaded')
            },
          },
          loadInput,
          h('button', { class: 'btn ghost', type: 'submit' }, 'Load matchup'),
        ),
      ),
    )
    built.after?.()
  }

  // Option controls inside the mode builders ask for a rebuild through this event.
  const onRebuild = () => build()
  document.addEventListener('versus:rebuild', onRebuild)
  build()
  return {
    el: root,
    dispose() {
      stopLive?.()
      document.removeEventListener('versus:rebuild', onRebuild)
    },
  }
}

function toRows<T>(list: Ranked<T>[], basis: (r: Ranked<T>) => string | undefined): Row[] {
  return list.map((r) => ({ athlete: r.athlete, display: r.display, quality: r.quality, sortValue: r.sortValue, basis: basis(r), ...(r.normalized ? { normalized: r.normalized } : {}) }))
}

function normalizeToggle(m: Matchup, label = 'Size-adjust the ranking'): HTMLElement {
  return h('label', { class: 'toggle', for: 'normalize' }, h('input', { type: 'checkbox', id: 'normalize', checked: m.opts.normalize === true, onchange: (e: Event) => ((last = { ...last, opts: { ...last.opts, normalize: (e.target as HTMLInputElement).checked } }), document.dispatchEvent(new CustomEvent('versus:rebuild'))) }), label)
}

function buildMode(ctx: AppContext, m: Matchup, athletes: Athlete[]): Built {
  const scene = ctx.viewer.scene
  const opt = <T extends string>(key: string, fallback: T): T => (typeof m.opts[key] === 'string' ? (m.opts[key] as T) : fallback)
  const set = (opts: Matchup['opts']) => {
    last = { ...last, opts: { ...last.opts, ...opts } }
    document.dispatchEvent(new CustomEvent('versus:rebuild'))
  }
  switch (m.mode) {
    case 'sprint': {
      const dist = opt('distance', '40yd')
      const [n, unit] = [Number(dist.replace(/\D/g, '')), dist.endsWith('yd') ? 'yd' : 'm'] as [number, 'yd' | 'm']
      const stage = new SprintStage(scene, athletes, n, unit)
      const rows: Row[] = stage.rows.map((r) => {
        const topMph = r.profile.vmax / MPH_TO_MS
        const norm = normalizeSpeed(r.athlete, topMph, r.profile.quality)
        return {
          athlete: r.athlete,
          display: `${r.time.toFixed(2)} s`,
          quality: weakest(r.profile.quality, n > 40 && unit === 'm' ? 'SIMULATED' : 'ESTIMATED'),
          sortValue: -r.time,
          basis: `${r.profile.basis} Top speed ${topMph.toFixed(1)} mph.`,
          ...(norm ? { normalized: { display: `${norm.value.toFixed(1)} mph`, quality: norm.quality, method: norm.method, value: norm.value } } : {}),
        }
      })
      const replay = h(
        'button',
        {
          class: 'btn primary',
          type: 'button',
          onclick: () => photoFinish(ctx, stage),
        },
        'Photo finish replay',
      )
      stage.onEnd = () => {
        if (!ctx.viewer.reducedMotion) photoFinish(ctx, stage)
      }
      return {
        stage,
        env: [unit === 'yd' ? 'field' : 'track', { lanes: athletes.length, length: stage.distance, unit }],
        rows,
        extra: [seg(['10yd', '20yd', '40yd', '100m', '200m'].map((v) => ({ value: v, label: v.replace('yd', ' yd').replace('m', ' m') })), dist, (v) => set({ distance: v }), 'Distance'), normalizeToggle(m, 'Rank by size-adjusted top speed'), replay],
        live: (t) =>
          stage.rows.map((r, i) => {
            const st = stage.stateOf(i, t - stage.start)
            const d = unit === 'yd' ? st.distance / 0.9144 : st.distance
            return { label: r.athlete.name.split(' ').slice(-1)[0]!, big: `${(st.speed / MPH_TO_MS).toFixed(1)}`, sub: `mph · ${Math.min(n, d).toFixed(1)} ${unit} · ${st.finished ? `${r.time.toFixed(2)} s` : `${Math.max(0, t - stage.start).toFixed(2)} s`}` }
          }),
      }
    }
    case 'jump': {
      const event = opt<JumpEvent>('event', 'maxVertical')
      const stage = new JumpStage(scene, athletes, event)
      return {
        stage,
        env: ['studio'],
        rows: toRows(jumpContest(athletes, event), (r) => r.result.basis),
        extra: [seg((Object.keys(JUMP_LABEL) as JumpEvent[]).map((v) => ({ value: v, label: JUMP_LABEL[v] })), event, (v) => set({ event: v }), 'Jump'), event !== 'broadJump' ? normalizeToggle(m, 'Rank by power per kilogram') : h('span')],
      }
    }
    case 'lift': {
      const lift = opt<LiftEvent>('lift', 'bench')
      const load = typeof m.opts.load === 'number' ? m.opts.load : 0
      const stage = new LiftStage(scene, athletes, lift, load || undefined)
      const contest = liftContest(athletes, lift, load || undefined)
      const roster = allAthletes()
      const board = [...roster].sort((a, b) => liftValue(b, lift).value - liftValue(a, lift).value)
      const loadField = h('input', {
        type: 'number',
        id: 'lift-load',
        min: '45',
        max: '900',
        step: '5',
        value: load ? String(load) : '',
        placeholder: 'Max',
        style: { width: '7rem' },
        onchange: (e: Event) => set({ load: Number((e.target as HTMLInputElement).value) || 0 }),
      })
      return {
        stage,
        env: ['gym'],
        rows: toRows(contest, (r) => `${r.result.basis} Leaderboard rank ${board.findIndex((a) => a.id === r.athlete.id) + 1} of ${roster.length} for ${LIFT_LABEL[lift].toLowerCase()}.`),
        extra: [
          seg((Object.keys(LIFT_LABEL) as LiftEvent[]).map((v) => ({ value: v, label: LIFT_LABEL[v] })), lift, (v) => set({ lift: v }), 'Lift'),
          h('div', { class: 'field' }, h('label', { for: 'lift-load' }, 'Reps at load (lb), blank for max'), loadField),
          normalizeToggle(m, 'Rank by lift at 200 lb bodyweight'),
        ],
        live: (t) =>
          athletes.map((a, i) => ({
            label: a.name.split(' ').slice(-1)[0]!,
            big: load ? `${stage.repsDone(i, t)}` : `${stage.loads[i]!.toFixed(0)}`,
            sub: load ? `reps at ${load} lb (of ${stage.reps[i]})` : 'lb, one-rep max',
          })),
      }
    }
    case 'arm': {
      const ball = opt<Ball>('ball', 'baseball')
      const contestKind = opt<'distance' | 'accuracy'>('contest', 'distance')
      const results = athletes.map((a) => throwContest(a, ball))
      const stage = new ThrowStage(scene, athletes, ball, results.map((r) => r.velocityMph))
      const extra = [
        seg((Object.keys(BALLS) as Ball[]).map((v) => ({ value: v, label: BALLS[v].label })), ball, (v) => set({ ball: v }), 'Ball'),
        seg(
          [
            { value: 'distance', label: 'Velocity and distance' },
            { value: 'accuracy', label: 'Accuracy targets' },
          ],
          contestKind,
          (v) => set({ contest: v }),
          'Throw contest',
        ),
      ]
      if (contestKind === 'accuracy') {
        const yards = typeof m.opts.target === 'number' ? m.opts.target : 20
        const rng = createRng(m.seed)
        const acc = athletes.map((a) => ({ a, r: accuracyContest(a, ball, yards * 0.9144, rng) }))
        const targetSvg = (r: (typeof acc)[number]['r'], color: string) =>
          s(
            'svg',
            { viewBox: '-2 -2 4 4', width: '120', height: '120', role: 'img', 'aria-label': `Target with ${r.throws.length} throws, ${r.total} points` },
            [1.5, 1, 0.5].map((rad) => s('circle', { cx: 0, cy: 0, r: rad, fill: 'none', stroke: 'var(--ink-2)', 'stroke-width': 0.03 })),
            r.throws.map((x) => s('circle', { cx: Math.max(-1.9, Math.min(1.9, x.dx)), cy: Math.max(-1.9, Math.min(1.9, -x.dy)), r: 0.09, fill: color, stroke: 'var(--surface)', 'stroke-width': 0.02 })),
          )
        const roster = allAthletes()
        extra.push(
          h('div', { class: 'field' }, h('label', { for: 'target-yd' }, 'Target distance (yd)'), h('input', { type: 'number', id: 'target-yd', min: '5', max: '60', step: '5', value: String(yards), style: { width: '6rem' }, onchange: (e: Event) => set({ target: Number((e.target as HTMLInputElement).value) || 20 }) })),
          h('div', { class: 'row', style: { width: '100%' } }, acc.map(({ a, r }) => h('figure', { class: 'stack', style: { margin: '0', gap: '2px', alignItems: 'center' } }, targetSvg(r, athleteColor(roster.findIndex((x) => x.id === a.id))), h('figcaption', { class: 'src' }, `${a.name.split(' ').slice(-1)[0]}: ${r.total} pts`)))),
        )
        return {
          stage,
          env: ['field', { lanes: athletes.length, length: 60, unit: 'yd' }],
          rows: acc.map(({ a, r }) => ({ athlete: a, display: `${r.total} pts`, quality: 'SIMULATED', sortValue: r.total, basis: `10 throws at ${yards} yd; spread ${(r.sdM * 100).toFixed(0)} cm. Rings 0.5, 1 and 1.5 m score 3, 2, 1.` })),
          extra,
        }
      }
      return {
        stage,
        env: ['field', { lanes: athletes.length, length: Math.max(60, ...stage.rows.map((r) => r.distanceM)) + 10, unit: 'yd' }],
        rows: results.map((r, i) => ({ athlete: athletes[i]!, display: `${r.velocityMph.toFixed(1)} mph · ${r.distanceYd.toFixed(0)} yd`, quality: r.quality, sortValue: r.velocityMph, basis: `${r.basis} Distance from a drag model at the best launch angle.` })),
        extra,
      }
    }
    case 'atbat': {
      const pitcherId = typeof m.opts.pitcher === 'string' && athletes.some((a) => a.id === m.opts.pitcher) ? (m.opts.pitcher as string) : (athletes.find((a) => a.pitches?.length) ?? athletes[0]!).id
      const batterId = typeof m.opts.batter === 'string' && athletes.some((a) => a.id === m.opts.batter) ? (m.opts.batter as string) : (athletes.find((a) => a.id !== pitcherId) ?? athletes[0]!).id
      const pa = typeof m.opts.pa === 'number' ? m.opts.pa : 4
      const pitcher = makePitcher(getAthlete(pitcherId)!)
      const batter = makeBatter(getAthlete(batterId)!)
      const duel = simulateDuel(pitcher, batter, createRng(m.seed), pa)
      const longRng = createRng(m.seed ^ 0x9e3779b9)
      const long = summarize(Array.from({ length: 300 }, () => simulatePlateAppearance(pitcher, batter, longRng)))
      const stage = new AtBatStage(scene, pitcher, batter, duel)
      const zone = h('div')
      const probs = h('div', { class: 'stack' })
      let lastKey = ''
      const draw = (t: number) => {
        const slot = stage.slotAt(t)
        const idx = slot ? stage.slots.indexOf(slot) : -1
        // Redraw when the pitch changes and again when it reaches the plate.
        const key = `${idx}:${slot && t >= slot.arrive ? 1 : 0}`
        if (key === lastKey) return
        lastKey = key
        zone.replaceChildren(strikeZone(stage.pitchesUpTo(t + 0.01).map((x) => x.event), batter.zone))
        if (slot) {
          const e = slot.event
          const shares = outcomeShares(batter, e.pitch)
          probs.replaceChildren(
            h('h3', null, `Pitch ${slot.index + 1} of plate appearance ${slot.pa + 1}: ${e.pitch.mph.toFixed(1)} mph ${e.pitch.type}`),
            h(
              'div',
              { class: 'bars' },
              [
                ['Swing', e.probabilities.swing],
                ['Whiff', e.probabilities.whiff],
                ['Foul', e.probabilities.foul],
                ['In play', e.probabilities.inPlay],
              ].map(([l, v]) => h('div', { class: 'bar-row' }, h('span', null, l as string), h('div', { class: 'bar-track' }, h('div', { class: 'bar-fill accent', style: { width: `${(v as number) * 100}%` } })), h('span', { class: 'num mono' }, `${Math.round((v as number) * 100)}%`))),
            ),
            h('p', { class: 'src' }, `If put in play: out ${pct(shares.out)}, single ${pct(shares.single)}, double ${pct(shares.double)}, triple ${pct(shares.triple)}, home run ${pct(shares.homeRun)}. From exit velocity (bat speed ${batter.batSpeedMph.toFixed(0)} mph), launch angle and spray.`),
          )
        }
      }
      const roster = athletes.map((a) => ({ value: a.id, label: a.name }))
      return {
        title: `At-bat: ${pitcher.athlete.name.split(' ').slice(-1)[0]} pitching to ${batter.athlete.name.split(' ').slice(-1)[0]}`,
        stage,
        env: ['diamond'],
        rows: [
          { athlete: batter.athlete, display: `${duel.line.h}-for-${duel.line.pa - duel.line.bb}, ${duel.line.hr} HR, ${duel.line.bb} BB, ${duel.line.k} K`, quality: 'SIMULATED', sortValue: duel.line.avg, basis: `Batting: ${duel.appearances.map((p) => p.result).join(', ')}. Over 300 simulated plate appearances: .${Math.round(long.avg * 1000).toString().padStart(3, '0')} AVG, ${pct(long.k / long.pa)} K, ${pct(long.bb / long.pa)} BB, ${pct(long.hr / long.pa)} HR.` },
          { athlete: pitcher.athlete, display: `${duel.line.k} K, ${duel.line.bb} BB, ${duel.line.h} H allowed`, quality: pitcher.quality, sortValue: 1 - duel.line.avg, basis: pitcher.basis },
        ],
        extra: [
          selectField('pitcher', 'Pitcher', roster, pitcherId, (v) => set({ pitcher: v })),
          selectField('batter', 'Batter', roster, batterId, (v) => set({ batter: v })),
          seg(
            [3, 4, 5, 8].map((v) => ({ value: String(v), label: `${v} PA` })),
            String(pa),
            (v) => set({ pa: Number(v) }),
            'Plate appearances',
          ),
          h('div', { class: 'row', style: { width: '100%', alignItems: 'flex-start' } }, h('div', { class: 'stack', style: { gap: '4px' } }, h('span', { class: 'eyebrow' }, 'Strike zone, catcher’s view'), zone), h('div', { class: 'grow', style: { minWidth: '220px' } }, probs)),
          h('button', { class: 'btn ghost', type: 'button', onclick: () => ctx.viewer.setCamera(new THREE.Vector3(0, 1.7, -3.6), new THREE.Vector3(0, 1.1, 9)) }, 'Catcher camera'),
        ],
        live: (t) => {
          draw(t)
          const slot = stage.slotAt(t)
          const e = slot?.event
          return [
            { label: 'Count', big: e ? `${e.balls}-${e.strikes}` : '0-0', sub: slot ? `PA ${slot.pa + 1} of ${pa}` : '' },
            { label: 'Pitch', big: e ? `${e.pitch.mph.toFixed(0)}` : '–', sub: e ? `mph ${e.pitch.type}` : '' },
            { label: 'Result', big: e && t >= slot!.arrive ? (e.batted ? `${e.batted.exitVelocityMph.toFixed(0)}` : RESULT_SHORT[e.result]) : '…', sub: e?.batted && t >= slot!.arrive ? `mph EV, ${e.batted.launchAngleDeg.toFixed(0)}°, ${(e.batted.distanceM / 0.3048).toFixed(0)} ft, ${e.batted.outcome}` : '' },
          ]
        },
      }
    }
    case 'shoot': {
      const contest = opt<'ft' | 'three' | 'chart'>('contest', 'three')
      const rng = createRng(m.seed)
      const results = athletes.map((a) => (contest === 'ft' ? { shots: freeThrowContest(a, rng).shots } : contest === 'three' ? threePointContest(a, rng) : shotChartChallenge(a, rng, 2)))
      const pointsOf = (shot: Shot) => (contest === 'three' ? (shot.isMoneyBall ? 2 : 1) : contest === 'chart' ? (ZONES[shot.zone].three ? 3 : 2) : 1)
      const stage = new ShootingStage(scene, athletes, results.map((r) => r.shots), pointsOf)
      const totals = results.map((r) => r.shots.reduce((sum, x) => sum + (x.made ? pointsOf(x) : 0), 0))
      const label = contest === 'ft' ? 'made of 10' : contest === 'three' ? 'of 30' : 'points'
      return {
        stage,
        env: ['court'],
        rows: athletes.map((a, i) => {
          const made = results[i]!.shots.filter((x) => x.made).length
          const p0 = results[i]!.shots[0]?.p ?? 0
          return { athlete: a, display: `${totals[i]} ${label}`, quality: 'SIMULATED', sortValue: totals[i]!, basis: `${made} of ${results[i]!.shots.length} made. Make chance from ${a.league === 'NBA' ? 'their shooting percentages' : 'cross-sport defaults'} (first shot ${(p0 * 100).toFixed(0)}%).` }
        }),
        extra: [
          seg(
            [
              { value: 'ft', label: 'Free throws' },
              { value: 'three', label: 'Three-point contest' },
              { value: 'chart', label: 'Shot chart challenge' },
            ],
            contest,
            (v) => set({ contest: v }),
            'Shooting contest',
          ),
        ],
        live: (t) => {
          const sc = stage.scoreAt(t)
          return athletes.map((a, i) => ({ label: a.name.split(' ').slice(-1)[0]!, big: String(sc[i]), sub: label }))
        },
      }
    }
    case 'agility': {
      const drill = opt<AgilityEvent>('drill', 'shuttle')
      const stage = new AgilityStage(scene, athletes, drill)
      const list = rankDescending(agilityContest(athletes, drill))
      return {
        stage,
        env: drill === 'laneAgility' ? ['court'] : ['field', { lanes: 8, length: 20, unit: 'yd' }],
        rows: toRows(list, (r) => r.result.basis),
        extra: [seg((Object.keys(AGILITY_LABEL) as AgilityEvent[]).map((v) => ({ value: v, label: AGILITY_LABEL[v] })), drill, (v) => set({ drill: v }), 'Drill')],
      }
    }
  }
}

const RESULT_SHORT: Record<PitchEvent['result'], string> = { ball: 'Ball', calledStrike: 'K looking', whiff: 'Whiff', foul: 'Foul', inPlay: 'In play' }

function pct(v: number): string {
  return `${Math.round(v * 100)}%`
}

/** Strike zone from the catcher's view; marker shape shows the result. */
function strikeZone(events: PitchEvent[], zone: { bottom: number; top: number }): SVGSVGElement {
  const W = 220
  const H = 240
  const sx = (x: number) => W / 2 - x * 160
  const sy = (y: number) => H - 20 - (y - 0.2) * 160
  const svg = s('svg', { class: 'zone-svg', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': `Strike zone with ${events.length} pitches` })
  svg.append(s('rect', { x: sx(PLATE_HALF_WIDTH), y: sy(zone.top), width: sx(-PLATE_HALF_WIDTH) - sx(PLATE_HALF_WIDTH), height: sy(zone.bottom) - sy(zone.top), fill: 'none', stroke: 'var(--ink)', 'stroke-width': 2 }))
  events.forEach((e, i) => {
    const x = sx(e.flight.plate.x)
    const y = sy(e.flight.plate.y)
    const title = s('title', null, `${i + 1}: ${e.pitch.mph.toFixed(0)} mph ${e.pitch.type}, ${e.result}`)
    const color = e.result === 'ball' ? 'var(--q-verified)' : e.result === 'inPlay' ? 'var(--accent)' : 'var(--q-estimated)'
    const shape =
      e.result === 'ball'
        ? s('circle', { cx: x, cy: y, r: 7, fill: 'var(--surface)', stroke: color, 'stroke-width': 2.5 }, title)
        : e.result === 'inPlay'
          ? s('path', { d: `M${x},${y - 8} L${x + 8},${y} L${x},${y + 8} L${x - 8},${y} Z`, fill: color }, title)
          : e.result === 'whiff'
            ? s('path', { d: `M${x - 6},${y - 6} L${x + 6},${y + 6} M${x + 6},${y - 6} L${x - 6},${y + 6}`, stroke: color, 'stroke-width': 3 }, title)
            : s('rect', { x: x - 6, y: y - 6, width: 12, height: 12, fill: e.result === 'foul' ? 'var(--surface)' : color, stroke: color, 'stroke-width': 2.5 }, title)
    svg.append(shape, s('text', { x: x + 9, y: y - 6 }, String(i + 1)))
  })
  svg.append(s('text', { x: 6, y: H - 4 }, '○ ball  □ strike  ▣ foul  × whiff  ◆ in play'))
  return svg
}

function photoFinish(ctx: AppContext, stage: SprintStage): void {
  const w = stage.photoWindow()
  const half = (stage.lanes * 1.4) / 2
  stage.loop = false
  stage.seek(w.from)
  stage.playing = true
  ctx.viewer.timeScale = 0.1
  ctx.viewer.setCamera(new THREE.Vector3(half + 3.2, 1.0, stage.distance + 0.01), new THREE.Vector3(0, 0.95, stage.distance))
  const ranking = stage.ranking()
  const gap = ranking.length > 1 ? ranking[1]!.time - ranking[0]!.time : 0
  toast(`Photo finish: ${ranking[0]!.athlete.name} by ${gap.toFixed(2)} s`)
  const off = ctx.viewer.onFrame(() => {
    if (stage.time >= w.to) {
      stage.playing = false
      off()
    }
  })
}

