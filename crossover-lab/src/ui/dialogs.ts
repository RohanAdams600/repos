import { heatGradientCss, type HeatPalette } from '../three/palette'
import { selectField } from './components'
import { h } from './dom'
import { CATEGORICAL, settings, updateSettings, type CategoricalPalette, type Settings } from './settings'

function modal(label: string, ...children: HTMLElement[]): HTMLDialogElement {
  const dialog = h('dialog', { 'aria-label': label }, h('div', { class: 'stack' }, ...children, h('div', { class: 'row' }, h('button', { class: 'btn', type: 'button', onclick: () => dialog.close() }, 'Done')))) as HTMLDialogElement
  dialog.addEventListener('close', () => dialog.remove())
  document.body.appendChild(dialog)
  dialog.showModal()
  return dialog
}

export function openSettings(): void {
  const s = settings()
  const swatches = (p: CategoricalPalette) => h('span', { class: 'row', style: { gap: '3px' } }, CATEGORICAL[p].colors.map((c) => h('span', { class: 'swatch', style: { background: c } })))
  const ramps = (p: HeatPalette) => h('span', { class: 'legend' }, h('span', { class: 'ramp' }, heatGradientCss(p).map((c) => h('span', { style: { background: c } }))))
  modal(
    'Settings',
    h('h2', null, 'Settings'),
    selectField<Settings['theme']>('set-theme', 'Theme', [
      { value: 'system', label: 'Match my device' },
      { value: 'light', label: 'Light' },
      { value: 'dark', label: 'Dark' },
    ], s.theme, (v) => updateSettings({ theme: v })),
    selectField<Settings['contrast']>('set-contrast', 'Contrast', [
      { value: 'normal', label: 'Standard' },
      { value: 'more', label: 'More contrast' },
    ], s.contrast, (v) => updateSettings({ contrast: v })),
    h('div', { class: 'stack', style: { gap: '4px' } }, selectField<CategoricalPalette>('set-cat', 'Athlete colors (color-blind safe)', (Object.keys(CATEGORICAL) as CategoricalPalette[]).map((p) => ({ value: p, label: CATEGORICAL[p].label })), s.athletePalette, (v) => updateSettings({ athletePalette: v })), swatches(s.athletePalette)),
    h('div', { class: 'stack', style: { gap: '4px' } }, selectField<HeatPalette>('set-heat', 'Heat map palette', [
      { value: 'viridis', label: 'Viridis' },
      { value: 'cividis', label: 'Cividis (strongest for color vision deficiency)' },
      { value: 'grayscale', label: 'Grayscale' },
    ], s.heatPalette, (v) => updateSettings({ heatPalette: v })), ramps(s.heatPalette)),
    selectField<Settings['motion']>('set-motion', 'Motion', [
      { value: 'system', label: 'Match my device' },
      { value: 'reduce', label: 'Reduce: start replays paused, cut camera moves' },
      { value: 'full', label: 'Full' },
    ], s.motion, (v) => updateSettings({ motion: v })),
    h('label', { class: 'toggle', for: 'set-captions' }, h('input', { type: 'checkbox', id: 'set-captions', checked: s.captions, onchange: (e: Event) => updateSettings({ captions: (e.target as HTMLInputElement).checked }) }), 'Show captions on the stage'),
    h('label', { class: 'toggle', for: 'set-fps' }, h('input', { type: 'checkbox', id: 'set-fps', checked: s.showFps, onchange: (e: Event) => updateSettings({ showFps: (e.target as HTMLInputElement).checked }) }), 'Show frame rate'),
    h('p', { class: 'src' }, 'Saved in this browser only.'),
  )
}

export function openHelp(): void {
  const rows: [string, string][] = [
    ['Tab', 'Move through controls; every control works from the keyboard'],
    ['Space', 'Play or pause the replay'],
    [', and .', 'Back or forward one frame'],
    ['R', 'Restart'],
    ['1 to 6', 'Broadcast, sideline, behind, overhead, close-up, first-person camera'],
    ['Arrow keys', 'Orbit the camera (focus the stage first)'],
    ['+ and −', 'Zoom (focus the stage first)'],
    ['C', 'Captions on or off'],
    ['← and → on tabs', 'Switch athlete sections'],
    ['Esc', 'Close a popup'],
  ]
  modal(
    'Keyboard shortcuts',
    h('h2', null, 'Keyboard shortcuts'),
    h('div', { class: 'table-wrap' }, h('table', { class: 'data' }, h('tbody', null, rows.map(([k, d]) => h('tr', null, h('td', null, h('kbd', null, k)), h('td', null, d)))))),
    h('p', { class: 'src' }, 'Captions describe each phase of a motion and are read out to screen readers.'),
  )
}
