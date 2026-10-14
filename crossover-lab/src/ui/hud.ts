import type { TimelineStage } from '../stage/timeline'
import { PRESET_LABEL, type CameraPreset, type Viewer } from '../three/viewer'
import { announce, h, toast } from './dom'
import { onSettings, reducedMotion, settings } from './settings'

export interface HudOptions {
  transport?: boolean
  presets?: CameraPreset[]
  record?: boolean
  ar?: () => void
  extra?: HTMLElement[]
}

const SPEEDS = [0.1, 0.25, 0.5, 1] as const

const ICON = {
  play: 'M8 5v14l11-7z',
  pause: 'M6 5h4v14H6zm8 0h4v14h-4z',
  back: 'M6 6h2v12H6zm3.5 6 8.5 6V6z',
  fwd: 'M16 6h2v12h-2zM6 18l8.5-6L6 6z',
  restart: 'M12 5V2L7 6l5 4V7a5 5 0 1 1-5 5H5a7 7 0 1 0 7-7z',
}

function icon(path: string): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('aria-hidden', 'true')
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  p.setAttribute('d', path)
  svg.appendChild(p)
  return svg
}

/**
 * Overlay on the 3D stage: camera presets, the replay transport (play, frame step, slow
 * motion, scrub), captions, clip recording and AR.
 */
export class Hud {
  readonly el: HTMLElement
  private stage: TimelineStage | null = null
  private readonly caption: HTMLElement
  private readonly fps: HTMLElement
  private scrub?: HTMLInputElement
  private timeText?: HTMLElement
  private playBtn?: HTMLButtonElement
  private lastCaption = ''
  private recording = false

  constructor(
    private readonly viewer: Viewer,
    host: HTMLElement,
  ) {
    this.el = h('div', { class: 'hud' })
    this.caption = h('div', { class: 'caption-bar', 'aria-hidden': 'true', hidden: true })
    this.fps = h('div', { class: 'fps', hidden: true })
    host.append(this.el, this.fps)
    viewer.onFrame(() => this.tick())
    onSettings(() => this.tick(true))
  }

  bind(stage: TimelineStage | null, opts: HudOptions = {}): void {
    this.stage = stage
    this.lastCaption = ''
    const presets = opts.presets ?? ['broadcast', 'behind', 'overhead', 'firstPerson']
    const presetSeg = h(
      'div',
      { class: 'seg', role: 'group', 'aria-label': 'Camera' },
      presets.map((p, i) =>
        h(
          'button',
          {
            type: 'button',
            'aria-pressed': String(this.viewer.preset === p),
            title: `${PRESET_LABEL[p]} camera (key ${i + 1})`,
            onclick: () => this.setPreset(p),
          },
          PRESET_LABEL[p],
        ),
      ),
    )
    presetSeg.dataset.role = 'presets'
    const rows: HTMLElement[] = []
    const top = h('div', { class: 'hud-row' }, presetSeg, ...(opts.extra ?? []))
    if (opts.record) top.append(h('button', { class: 'btn ghost', type: 'button', style: { background: 'var(--surface)' }, onclick: () => this.record() }, 'Record clip'))
    if (opts.ar) top.append(h('button', { class: 'btn ghost', type: 'button', style: { background: 'var(--surface)' }, onclick: opts.ar }, 'View in AR'))
    rows.push(top)
    if (opts.transport && stage) {
      this.playBtn = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Pause', title: 'Play or pause (Space)', onclick: () => this.togglePlay() }, icon(ICON.pause))
      this.scrub = h('input', {
        type: 'range',
        min: '0',
        max: String(stage.duration),
        step: String(1 / 120),
        value: '0',
        'aria-label': 'Replay position',
        oninput: (e: Event) => {
          stage.playing = false
          this.syncPlay()
          stage.seek(Number((e.target as HTMLInputElement).value))
        },
      })
      this.timeText = h('span', { class: 'time' }, '0.00 s')
      const speed = h(
        'div',
        { class: 'seg', role: 'group', 'aria-label': 'Playback speed' },
        SPEEDS.map((v) =>
          h(
            'button',
            {
              type: 'button',
              'aria-pressed': String(this.viewer.timeScale === v),
              onclick: (e: Event) => {
                this.viewer.timeScale = v
                ;[...speed.querySelectorAll('button')].forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget)))
                announce(`Speed ${v} times`)
              },
            },
            `${v}×`,
          ),
        ),
      )
      const transport = h(
        'div',
        { class: 'transport' },
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Restart', title: 'Restart (R)', onclick: () => this.restart() }, icon(ICON.restart)),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Back one frame', title: 'Back one frame (,)', onclick: () => this.stepFrame(-1) }, icon(ICON.back)),
        this.playBtn,
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Forward one frame', title: 'Forward one frame (.)', onclick: () => this.stepFrame(1) }, icon(ICON.fwd)),
        this.scrub,
        this.timeText,
        speed,
      )
      rows.push(transport)
    } else {
      this.scrub = undefined
      this.playBtn = undefined
      this.timeText = undefined
    }
    this.el.replaceChildren(this.caption, ...rows)
    if (reducedMotion() && stage && opts.transport) {
      // Reduced motion: start paused on a representative frame; the viewer can press play.
      stage.playing = false
      stage.seek(stage.duration * 0.5)
      this.syncPlay()
    }
    this.tick(true)
  }

  setPreset(p: CameraPreset): void {
    this.viewer.setPreset(p)
    this.el.querySelectorAll<HTMLButtonElement>('[data-role="presets"] button').forEach((b) => b.setAttribute('aria-pressed', String(b.textContent === PRESET_LABEL[p])))
    announce(`${PRESET_LABEL[p]} camera`)
  }

  togglePlay(): void {
    if (!this.stage) return
    if (!this.stage.playing && this.stage.time >= this.stage.duration && !this.stage.loop) this.stage.restart()
    else this.stage.playing = !this.stage.playing
    this.syncPlay()
  }

  restart(): void {
    this.stage?.restart()
    this.syncPlay()
  }

  stepFrame(dir: 1 | -1): void {
    if (!this.stage) return
    this.stage.playing = false
    this.stage.seek(this.stage.time + dir / 60)
    this.syncPlay()
  }

  private syncPlay(): void {
    if (!this.playBtn || !this.stage) return
    const playing = this.stage.playing
    this.playBtn.replaceChildren(icon(playing ? ICON.pause : ICON.play))
    this.playBtn.setAttribute('aria-label', playing ? 'Pause' : 'Play')
  }

  private tick(force = false): void {
    const s = settings()
    this.fps.hidden = !s.showFps
    if (s.showFps) this.fps.textContent = `${this.viewer.fps} fps`
    const stage = this.stage
    if (!stage) {
      this.caption.hidden = true
      return
    }
    if (this.scrub) {
      if (Number(this.scrub.max) !== stage.duration) this.scrub.max = String(stage.duration)
      if (document.activeElement !== this.scrub) this.scrub.value = String(stage.time)
      if (this.timeText) this.timeText.textContent = `${stage.time.toFixed(2)} s`
    }
    const text = stage.caption()
    if (text !== this.lastCaption || force) {
      this.lastCaption = text
      this.caption.textContent = text
      this.caption.hidden = !s.captions || !text
      if (text) announce(text)
    }
    if (this.playBtn && stage.playing !== (this.playBtn.getAttribute('aria-label') === 'Pause')) this.syncPlay()
  }

  /** Record the canvas for the length of the current replay (max 12 s) as a WebM clip. */
  async record(): Promise<void> {
    if (this.recording) return
    const canvas = this.viewer.canvas
    if (typeof MediaRecorder === 'undefined' || !('captureStream' in canvas)) {
      toast('This browser cannot record the 3D view.')
      return
    }
    const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'].find((t) => MediaRecorder.isTypeSupported(t))
    if (!mime) {
      toast('This browser cannot record video.')
      return
    }
    this.recording = true
    const seconds = Math.min(12, Math.max(2, (this.stage?.duration ?? 4) / Math.max(0.1, this.viewer.timeScale)))
    this.stage?.restart()
    const stream = canvas.captureStream(30)
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6_000_000 })
    const chunks: Blob[] = []
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data)
    const done = new Promise<void>((resolve) => (rec.onstop = () => resolve()))
    rec.start()
    toast(`Recording ${seconds.toFixed(0)} s…`)
    await new Promise((r) => setTimeout(r, seconds * 1000))
    rec.stop()
    await done
    stream.getTracks().forEach((t) => t.stop())
    this.recording = false
    const blob = new Blob(chunks, { type: mime })
    showClip(blob, mime.startsWith('video/mp4') ? 'mp4' : 'webm')
  }
}

/** Show the recorded clip with a download link (works on a normal web host). */
export function showClip(blob: Blob, ext: string): void {
  const url = URL.createObjectURL(blob)
  const dialog = h(
    'dialog',
    { 'aria-label': 'Recorded clip' },
    h(
      'div',
      { class: 'stack' },
      h('h2', null, 'Your clip'),
      h('video', { src: url, controls: true, autoplay: true, muted: true, loop: true, playsinline: true, style: { width: '100%', borderRadius: '6px' } }),
      h('p', { class: 'muted' }, 'Simulated from available data. Not a prediction or real footage.'),
      h(
        'div',
        { class: 'row' },
        h('a', { class: 'btn primary', href: url, download: `crossover-lab-clip.${ext}` }, 'Download clip'),
        h('button', { class: 'btn ghost', type: 'button', onclick: () => (dialog as HTMLDialogElement).close() }, 'Close'),
      ),
    ),
  ) as HTMLDialogElement
  dialog.addEventListener('close', () => {
    URL.revokeObjectURL(url)
    dialog.remove()
  })
  document.body.appendChild(dialog)
  dialog.showModal()
}
