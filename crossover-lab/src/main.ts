import './styles.css'
import { onRosterChange } from './data/roster'
import { Viewer, type CameraPreset } from './three/viewer'
import type { AppContext, View } from './ui/context'
import { h, toast } from './ui/dom'
import { Hud } from './ui/hud'
import { applySettings, onSettings, reducedMotion, settings, updateSettings } from './ui/settings'
import { openHelp, openSettings } from './ui/dialogs'
import { athleteView, tabFor } from './ui/views/athlete'
import { LEAGUES, LEGAL, Rail } from './ui/rail'
import { rosterView } from './ui/views/roster'
import { standoutsView } from './ui/views/standouts'
import type { League } from './data/types'
import { versusView } from './ui/views/versus'
import { tournamentView } from './ui/views/tournament'
import { leadersView } from './ui/views/leaders'
import { buildView } from './ui/views/build'
import { cardsView } from './ui/views/cards'
import { aboutView } from './ui/views/about'
import { bracketsView, LADDER_HASH_PREFIX } from './ui/views/brackets'
import { methodologyView } from './ui/views/methodology'
import { importView } from './ui/views/import'
import { eventsView } from './ui/views/events'
import { parseEventsHash } from './stage/event-stages'

applySettings()

const NAV: { hash: string; label: string; match: (h: string) => boolean }[] = [
  { hash: '#roster', label: 'Athletes', match: (x) => x === '' || x === '#roster' || x.startsWith('#a.') },
  { hash: '#standouts', label: 'Standouts', match: (x) => x.startsWith('#standouts') },
  { hash: '#events', label: 'Versus', match: (x) => x.startsWith('#events') },
  { hash: '#versus', label: 'Crossover', match: (x) => x === '#versus' || x.startsWith('#m.') },
  { hash: '#brackets', label: 'Brackets', match: (x) => x.startsWith('#brackets') || x.startsWith('#ladder.') },
  { hash: '#decathlon', label: 'Decathlon', match: (x) => x === '#decathlon' },
  { hash: '#leaders', label: 'Leaders', match: (x) => x === '#leaders' },
  { hash: '#build', label: 'Build', match: (x) => x === '#build' },
  { hash: '#cards', label: 'Cards', match: (x) => x === '#cards' },
  { hash: '#methodology', label: 'Methodology', match: (x) => x === '#methodology' || x === '#about' || x === '#import' },
]

const nav = h('nav', { class: 'nav', 'aria-label': 'Main' })
const stageEl = h('div', { id: 'stage', tabindex: '0', role: 'application', 'aria-label': '3D stage. Arrow keys orbit, plus and minus zoom, 1 to 6 change camera.' })
const stageWrap = h('div', { class: 'stage-wrap' }, stageEl)
const panel = h('main', { class: 'panel', id: 'panel', tabindex: '-1' })
const live = h('div', { id: 'live-region', class: 'sr-only', 'aria-live': 'polite' })
const rail = new Rail()
const railToggle = h(
  'button',
  {
    class: 'btn ghost rail-toggle',
    type: 'button',
    'aria-controls': 'rail',
    'aria-expanded': 'false',
    onclick: () => {
      const open = !document.body.classList.contains('rail-open')
      document.body.classList.toggle('rail-open', open)
      railToggle.setAttribute('aria-expanded', String(open))
      if (open) rail.el.querySelector<HTMLElement>('.rail-search')?.focus()
    },
  },
  'Browse',
)
const closeRail = () => {
  document.body.classList.remove('rail-open')
  railToggle.setAttribute('aria-expanded', 'false')
}
rail.el.addEventListener('click', (e) => {
  if ((e.target as Element).closest('a')) closeRail()
})

const shell = h(
  'div',
  { class: 'shell' },
  h(
    'header',
    { class: 'topbar' },
    railToggle,
    h('a', { class: 'brand', href: '#roster' }, h('span', { class: 'pylon', 'aria-hidden': 'true' }), 'Crossover Lab'),
    nav,
    h(
      'div',
      { class: 'row', style: { gap: '4px' } },
      h('button', { class: 'btn ghost', type: 'button', onclick: () => openHelp(), 'aria-label': 'Keyboard shortcuts' }, '?'),
      h('button', { class: 'btn ghost', type: 'button', onclick: () => openSettings() }, 'Settings'),
    ),
  ),
  h('div', { class: 'main' }, rail.el, stageWrap, panel),
  live,
)
document.getElementById('app')!.appendChild(shell)

const viewer = new Viewer(stageEl)
viewer.reducedMotion = reducedMotion()
const hud = new Hud(viewer, stageWrap)
onSettings(() => {
  viewer.reducedMotion = reducedMotion()
  requestAnimationFrame(() => viewer.applyTheme())
})
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => viewer.applyTheme())

let current: View | null = null
let currentHash: string | null = null

const ctx: AppContext = {
  viewer,
  hud,
  navigate(hash, force) {
    if (location.hash === hash && force) render(true)
    else location.hash = hash
  },
}

const leagueOf = (x: string | undefined): League => (LEAGUES.includes(x as League) ? (x as League) : 'NFL')

function route(hash: string): View {
  if (hash.startsWith('#a.')) {
    const [, id, tab, arg] = hash.split('.')
    return athleteView(ctx, id ?? '', tabFor(tab), arg || undefined)
  }
  if (hash.startsWith('#standouts')) return standoutsView(ctx, leagueOf(hash.split('.')[1]))
  if (hash.startsWith('#m.')) return versusView(ctx, hash.slice(3))
  if (hash.startsWith(LADDER_HASH_PREFIX)) return bracketsView(ctx)
  const ev = parseEventsHash(hash)
  if (ev) return eventsView(ctx, ev.league, ev.eventId, ev.ids, ev.seed)
  switch (hash) {
    case '#versus':
      return versusView(ctx)
    case '#decathlon':
      return tournamentView(ctx)
    case '#leaders':
      return leadersView(ctx)
    case '#build':
      return buildView(ctx)
    case '#cards':
      return cardsView(ctx)
    case '#brackets':
      return bracketsView(ctx)
    case '#methodology':
      return methodologyView(ctx)
    case '#import':
      return importView(ctx)
    case '#about':
      return aboutView(ctx)
    default:
      return rosterView(ctx)
  }
}

function render(force = false): void {
  const hash = location.hash
  if (hash === currentHash && !force) return
  const sameAthlete = currentHash?.startsWith('#a.') && hash.startsWith('#a.') && currentHash.split('.')[1] === hash.split('.')[1]
  currentHash = hash
  current?.dispose?.()
  viewer.clearLabels()
  try {
    current = route(hash)
  } catch (err) {
    console.error(err)
    current = { el: h('div', { class: 'section' }, h('h1', null, 'Something went wrong'), h('p', null, 'This page failed to load. Go back to the roster and try again.'), h('a', { href: '#roster' }, 'Back to the roster')) }
  }
  panel.replaceChildren(current.el, h('footer', { class: 'legal-foot' }, h('p', null, LEGAL), h('p', null, 'Generic or licensed branding only: no logos or wordmarks. Licensed media and data only; nothing is scraped or rehosted. ', h('a', { href: '#methodology' }, 'How the numbers work'))))
  current.mounted?.()
  rail.render(hash.startsWith('#a.') ? hash.split('.')[1] ?? null : null)
  closeRail()
  nav.replaceChildren(...NAV.map((n) => h('a', { href: n.hash, 'aria-current': n.match(hash) ? 'page' : null }, n.label)))
  if (!sameAthlete) {
    panel.scrollTop = 0
    window.scrollTo({ top: 0 })
  }
  const heading = panel.querySelector('h1')
  document.title = heading ? `${heading.textContent} · Crossover Lab` : 'Crossover Lab'
}

window.addEventListener('hashchange', () => render())
onRosterChange(() => {
  rail.render()
  if (location.hash === '#build' || location.hash === '#leaders' || location.hash === '#cards') return
  render(true)
})
render(true)

const PRESET_KEYS: Record<string, CameraPreset> = { '1': 'broadcast', '2': 'sideline', '3': 'behind', '4': 'overhead', '5': 'closeup', '6': 'firstPerson' }

document.addEventListener('keydown', (e) => {
  const target = e.target as HTMLElement
  if (target.closest('input, select, textarea, [contenteditable="true"], dialog')) return
  if (e.metaKey || e.ctrlKey || e.altKey) return
  if (e.key === 'Escape' && document.body.classList.contains('rail-open')) {
    closeRail()
    railToggle.focus()
    return
  }
  if (target === stageEl && viewer.handleKey(e)) {
    e.preventDefault()
    return
  }
  const preset = PRESET_KEYS[e.key]
  if (preset) {
    hud.setPreset(preset)
    return
  }
  switch (e.key) {
    case ' ':
      if (target.closest('button, a')) return
      e.preventDefault()
      hud.togglePlay()
      break
    case ',':
      hud.stepFrame(-1)
      break
    case '.':
      hud.stepFrame(1)
      break
    case 'r':
    case 'R':
      hud.restart()
      break
    case 'c':
    case 'C':
      updateSettings({ captions: !settings().captions })
      toast(settings().captions ? 'Captions on' : 'Captions off')
      break
    case '?':
      openHelp()
      break
  }
})
