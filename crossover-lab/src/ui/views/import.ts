import { importRoster, parseCsv, REQUIRED_COLUMNS, ROSTER_STATUS_LABEL, type ImportResult } from '../../data/import'
import { formatMetric, METRICS } from '../../data/metrics'
import { clearImported, importedAthletes, saveImported } from '../../data/roster'
import type { Athlete, Measured, MetricKey, Quality } from '../../data/types'
import { weakest } from '../../data/types'
import { LineupStage } from '../../stage/lineup'
import { qualityChip } from '../components'
import type { AppContext, View } from '../context'
import { h, mount, toast } from '../dom'
import { athleteColor } from '../settings'

/** Columns in the downloadable template: the required ones, then the common optional ones. */
export const TEMPLATE_COLUMNS: readonly string[] = [...REQUIRED_COLUMNS, 'number', 'bats', 'throws', 'era', 'heightIn', 'weightLb', 'fortyS', 'sourceUrl']

/** Bigger files than this are almost certainly not a roster, and would stall the page. */
const MAX_FILE_BYTES = 5_000_000
/** Rows drawn in the preview table; the count above it covers the rest. */
const PREVIEW_ROWS = 200
/** Figures on the stage after a preview. */
const STAGE_MAX = 4

interface Draft {
  csv: string
  fileName: string
  provider: string
  licensed: boolean
  retrieved: string
}

function today(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Kept at module level: saving or clearing changes the roster, and the router rebuilds pages on
 * roster changes, so the draft, the preview and the save message must outlive one view instance.
 */
let draft: Draft = { csv: '', fileName: '', provider: '', licensed: false, retrieved: today() }
let preview: ImportResult | null = null
let notice = ''

const FIELD_STYLE = { padding: '7px 10px', border: '1px solid var(--line)', 'border-radius': 'var(--radius)', background: 'var(--surface)', color: 'inherit', 'max-width': '100%' }

function providerOf(a: Athlete): string {
  return Object.values(a.sources)[0]?.publisher ?? 'Unknown provider'
}

function figureList(a: Athlete): { text: string; quality: Quality | null } {
  const entries = Object.entries(a.metrics) as [MetricKey, Measured][]
  if (entries.length === 0) return { text: 'No figures', quality: null }
  return { text: entries.map(([k, m]) => `${METRICS[k].label} ${formatMetric(k, m.value)}`).join(' · '), quality: weakest(...entries.map(([, m]) => m.quality)) }
}

export function importView(ctx: AppContext): View {
  const template = new Blob([`${TEMPLATE_COLUMNS.join(',')}\r\n`], { type: 'text/csv' })
  const templateUrl = URL.createObjectURL(template)

  const status = h('div', { role: 'status', 'aria-live': 'polite' })
  const previewOut = h('div', { class: 'stack' })
  const savedOut = h('div', { class: 'stack' })
  let stageKey: string | null = null

  const setStage = (athletes: Athlete[]) => {
    const cast = athletes.slice(0, STAGE_MAX)
    const key = cast.map((a) => a.id).join(',')
    if (key === stageKey) return
    stageKey = key
    const stage = new LineupStage(ctx.viewer.scene, cast, () => 'idle', 1.6)
    ctx.viewer.setEnvironment('studio')
    ctx.viewer.setController(stage)
    ctx.hud.bind(stage, { presets: ['broadcast', 'behind', 'overhead'] })
    cast.forEach((a, i) =>
      ctx.viewer.addLabel(`imp${i}`, h('div', { style: { '--swatch': athleteColor(i) } }, a.name), (o) => {
        stage.rigs[i]!.jointWorld('head', o)
        o.y += 0.34
        return o
      }),
    )
  }

  const say = (text: string) => mount(status, text ? h('p', { class: 'note' }, text) : null)

  /** Any change to the inputs makes the preview stale, so Save waits for a fresh one. */
  const edited = (change: Partial<Draft>) => {
    draft = { ...draft, ...change }
    if (!preview) return
    preview = null
    renderPreview()
    say('The file or its details changed. Choose Preview again before saving.')
  }

  // ------------------------------------------------------------------------------------------
  // Form

  const provider = h('input', { type: 'text', id: 'imp-provider', autocomplete: 'organization', value: draft.provider, oninput: () => edited({ provider: provider.value }) })
  const retrieved = h('input', { type: 'date', id: 'imp-retrieved', value: draft.retrieved, style: FIELD_STYLE, onchange: () => edited({ retrieved: retrieved.value }) })
  const licensed = h('input', { type: 'checkbox', id: 'imp-licensed', checked: draft.licensed, style: { width: '18px', height: '18px', 'accent-color': 'var(--accent)' }, onchange: () => edited({ licensed: licensed.checked }) })
  const csv = h('textarea', { id: 'imp-csv', rows: '9', spellcheck: 'false', autocomplete: 'off', style: { width: '100%', 'font-family': 'var(--mono)', 'font-size': 'var(--step--1)' }, oninput: () => edited({ csv: csv.value }) })
  csv.value = draft.csv
  const fileNote = h('span', { class: 'src', id: 'imp-file-note' }, draft.fileName ? `Loaded ${draft.fileName}.` : '')
  const file = h('input', {
    type: 'file',
    id: 'imp-file',
    accept: '.csv,text/csv',
    'aria-describedby': 'imp-file-note',
    style: { 'max-width': '100%' },
    onchange: () => {
      const f = file.files?.[0]
      if (!f) return
      if (f.size > MAX_FILE_BYTES) {
        toast('That file is over 5 MB. Split it into smaller roster files.')
        file.value = ''
        return
      }
      const reader = new FileReader()
      reader.onload = () => {
        const text = typeof reader.result === 'string' ? reader.result : ''
        csv.value = text
        edited({ csv: text, fileName: f.name })
        fileNote.textContent = `Loaded ${f.name}.`
        say(`Loaded ${f.name}. Choose Preview to check it.`)
      }
      reader.onerror = () => say(`Could not read ${f.name}. Try pasting its contents instead.`)
      reader.readAsText(f)
    },
  })

  const saveBtn = h('button', { class: 'btn primary', type: 'button', onclick: () => save() }, 'Save')
  const clearBtn = h('button', { class: 'btn ghost', type: 'button', onclick: () => clearAll() }, 'Clear imported')

  // ------------------------------------------------------------------------------------------
  // Preview, save and clear

  const renderPreview = () => {
    const ready = preview?.athletes.length ?? 0
    saveBtn.disabled = ready === 0
    saveBtn.textContent = ready ? `Save ${ready} athlete${ready === 1 ? '' : 's'}` : 'Save'
    if (!preview) {
      mount(previewOut, null)
      return
    }
    const { athletes, errors, ignoredColumns } = preview
    const shown = athletes.slice(0, PREVIEW_ROWS)
    mount(
      previewOut,
      h('h3', null, 'Preview'),
      errors.length
        ? h(
            'div',
            { class: 'stack', style: { gap: '6px' } },
            h('h4', { style: { margin: '0' } }, `${errors.length} problem${errors.length === 1 ? '' : 's'}: these rows are skipped`),
            h('ul', { class: 'list' }, errors.map((e) => h('li', null, h('strong', { style: { 'white-space': 'nowrap' } }, e.row === 0 ? 'File' : `Row ${e.row}`), h('span', { class: 'grow' }, e.message)))),
          )
        : null,
      ignoredColumns.length ? h('p', { class: 'src' }, `Columns not recognised, so not imported: ${ignoredColumns.join(', ')}.`) : null,
      athletes.length
        ? h(
            'div',
            { class: 'table-wrap' },
            h(
              'table',
              { class: 'data' },
              h('caption', { class: 'src', style: { 'text-align': 'left', padding: '8px 10px' } }, athletes.length > PREVIEW_ROWS ? `First ${PREVIEW_ROWS} of ${athletes.length} athletes.` : `${athletes.length} athlete${athletes.length === 1 ? '' : 's'} ready to save.`),
              h('thead', null, h('tr', null, ['Name', 'League', 'Team', 'Position', 'Status', 'Figures'].map((c) => h('th', { scope: 'col' }, c)))),
              h(
                'tbody',
                null,
                shown.map((a) => {
                  const figs = figureList(a)
                  return h(
                    'tr',
                    null,
                    h('td', null, h('strong', null, a.name), a.kit.number ? h('span', { class: 'src' }, ` #${a.kit.number}`) : null),
                    h('td', null, a.league),
                    h('td', null, a.team),
                    h('td', null, `${a.position} (${a.positionGroup})`),
                    h('td', null, ROSTER_STATUS_LABEL[a.status]),
                    h('td', null, h('span', { class: 'src' }, figs.text), ' ', figs.quality ? qualityChip(figs.quality, Object.values(a.metrics)[0]?.note ?? `Cited to ${providerOf(a)}.`) : null),
                  )
                }),
              ),
            ),
          )
        : null,
    )
  }

  const runPreview = () => {
    const rows = parseCsv(draft.csv)
    if (rows.length === 0) {
      preview = null
      renderPreview()
      say(draft.csv.trim() ? 'Only a header line was found. Add one row per athlete under it.' : 'Paste CSV or choose a .csv file first. The first line must be the header.')
      return
    }
    preview = importRoster(rows, { provider: draft.provider, licensed: draft.licensed, retrieved: draft.retrieved })
    renderPreview()
    const n = preview.athletes.length
    const bad = new Set(preview.errors.map((e) => e.row)).size
    say(`${n} athlete${n === 1 ? '' : 's'} ready${bad ? `, ${bad} row${bad === 1 ? '' : 's'} with problems` : ''}. Nothing is saved until you choose Save.`)
    if (n) setStage(preview.athletes)
  }

  const save = () => {
    const list = preview?.athletes ?? []
    if (list.length === 0) return
    preview = null
    notice = `Saved ${list.length} athlete${list.length === 1 ? '' : 's'} to this browser. They now appear on every page.`
    saveImported(list)
    toast(`Saved ${list.length} athlete${list.length === 1 ? '' : 's'}`)
    // The router may already have rebuilt the page on the roster change; if not, refresh here.
    if (el.isConnected) refresh()
  }

  const clearAll = () => {
    const n = importedAthletes().length
    if (n === 0) return
    if (!window.confirm(`Remove all ${n} imported athlete${n === 1 ? '' : 's'} from this browser? Built-in, standout and custom athletes are not affected.`)) return
    notice = `Removed ${n} imported athlete${n === 1 ? '' : 's'}.`
    clearImported()
    toast('Imported athletes cleared')
    if (el.isConnected) refresh()
  }

  const renderSaved = () => {
    const saved = importedAthletes()
    clearBtn.disabled = saved.length === 0
    const byProvider = new Map<string, number>()
    for (const a of saved) byProvider.set(providerOf(a), (byProvider.get(providerOf(a)) ?? 0) + 1)
    mount(
      savedOut,
      saved.length
        ? h('p', null, `${saved.length} imported athlete${saved.length === 1 ? ' is' : 's are'} saved in this browser: `, [...byProvider].map(([p, n]) => `${p} (${n})`).join(', '), '.')
        : h('p', { class: 'src' }, 'No imported athletes are saved in this browser.'),
      h('div', { class: 'row' }, clearBtn),
    )
  }

  const refresh = () => {
    renderPreview()
    renderSaved()
    // Shown once: whichever view instance renders the message first takes it.
    const text = notice
    notice = ''
    if (text) say(text)
    setStage(preview?.athletes.length ? preview.athletes : importedAthletes())
  }

  // ------------------------------------------------------------------------------------------

  const label = (forId: string, text: string, hint?: string) => h('label', { for: forId }, text, hint ? h('span', { class: 'src', style: { 'font-weight': '400' } }, ` ${hint}`) : null)
  const metricKeys = Object.keys(METRICS) as MetricKey[]

  const el = h(
    'div',
    { class: 'stack', style: { gap: '22px' } },
    h(
      'div',
      { class: 'stack', style: { gap: '8px' } },
      h('span', { class: 'eyebrow' }, 'Roster import'),
      h('h1', null, 'Import a roster'),
      h('p', { class: 'muted' }, 'Add athletes from a roster file or a licensed feed export. Kit colours come from the club, gear and movement from position defaults, and every figure cites the provider. Imports stay in this browser.'),
    ),
    h(
      'section',
      { class: 'section', 'aria-labelledby': 'imp-labels' },
      h('h2', { id: 'imp-labels' }, 'How imported figures are labelled'),
      h(
        'ul',
        { class: 'list' },
        h('li', null, qualityChip('VERIFIED'), h('span', { class: 'grow' }, 'Only when this data is licensed for this use ', h('em', null, 'and'), ' the row has a source URL (https) for the athlete.')),
        h('li', null, qualityChip('ESTIMATED'), h('span', { class: 'grow' }, 'Everything else: an unlicensed file, or a licensed row with no source URL. The note on each figure names the provider.')),
      ),
      h('p', { class: 'src' }, 'Only import data you have the rights to use. Do not paste figures copied from sites whose terms forbid it.'),
    ),
    h(
      'section',
      { class: 'section', 'aria-labelledby': 'imp-file-title' },
      h('div', { class: 'section-head' }, h('h2', { id: 'imp-file-title' }, 'Roster file'), h('a', { class: 'btn ghost', href: templateUrl, download: 'crossover-lab-roster-template.csv' }, 'Download CSV template')),
      h(
        'p',
        { class: 'src' },
        `Required columns: ${REQUIRED_COLUMNS.join(', ')}. League is NFL, MLB or NBA; team is the club abbreviation (blank only for free agents, legends and prospects); status is one of ${Object.keys(ROSTER_STATUS_LABEL).join(', ')}. Optional: number, bats, throws, era (decades played), sourceUrl and any figure column.`,
      ),
      h(
        'details',
        null,
        h('summary', null, `All ${metricKeys.length} figure columns`),
        h('ul', { class: 'src', style: { 'column-width': '220px', margin: '8px 0 0', 'padding-left': '1.2em' } }, metricKeys.map((k) => h('li', null, h('code', null, k), ` ${METRICS[k].label}${METRICS[k].unit ? ` (${METRICS[k].unit})` : ''}`))),
      ),
      h('div', { class: 'field' }, label('imp-provider', 'Provider', 'who supplied this file or feed, e.g. a team media guide'), provider),
      h('div', { class: 'row', style: { 'align-items': 'center' } }, h('div', { class: 'field' }, label('imp-retrieved', 'Retrieved on'), retrieved), h('label', { for: 'imp-licensed', class: 'row', style: { gap: '8px', 'align-items': 'center', 'font-weight': '600' } }, licensed, 'This data is licensed for this use')),
      h('div', { class: 'field' }, label('imp-file', 'Choose a .csv file'), file, fileNote),
      h('div', { class: 'field' }, label('imp-csv', 'Or paste CSV', 'first line is the header'), csv),
      h('div', { class: 'row' }, h('button', { class: 'btn', type: 'button', onclick: () => runPreview() }, 'Preview'), saveBtn),
      status,
      previewOut,
    ),
    h('section', { class: 'section', 'aria-labelledby': 'imp-saved-title' }, h('h2', { id: 'imp-saved-title' }, 'Saved imports'), savedOut),
  )

  refresh()
  return { el, dispose: () => URL.revokeObjectURL(templateUrl) }
}
