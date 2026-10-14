import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { buildEnvironment, type EnvKind, type EnvOptions } from './env'
import type { Rig } from './rig'

export type CameraPreset = 'broadcast' | 'behind' | 'overhead' | 'firstPerson' | 'free'

export const PRESET_LABEL: Record<CameraPreset, string> = {
  broadcast: 'Broadcast',
  behind: 'Behind',
  overhead: 'Overhead',
  firstPerson: 'First person',
  free: 'Free orbit',
}

/** What a page puts on the stage. The viewer calls update every frame with scaled time. */
export interface StageController {
  update(dt: number): void
  /** Where the camera looks. */
  focus(out: THREE.Vector3): THREE.Vector3
  /** Which way the main athlete faces (yaw, radians), for broadcast and behind cameras. */
  facing?(): number
  /** The athlete the first-person camera rides with. */
  focusRig?(): Rig | undefined
  /** Camera distance multiplier for wide scenes (races, pitch duels). */
  framing?(): number
  /** Custom broadcast camera offset from the focus point (overrides the side-on default). */
  broadcastOffset?(): THREE.Vector3
  dispose(): void
}

interface LabelEntry {
  el: HTMLElement
  get: (out: THREE.Vector3) => THREE.Vector3 | null
}

export class Viewer {
  readonly renderer: THREE.WebGLRenderer
  readonly scene = new THREE.Scene()
  readonly camera = new THREE.PerspectiveCamera(42, 1, 0.03, 600)
  readonly controls: OrbitControls
  readonly container: HTMLElement
  readonly labelLayer: HTMLElement
  timeScale = 1
  paused = false
  preset: CameraPreset = 'broadcast'
  follow = true
  fps = 60
  private controller: StageController | null = null
  private env: THREE.Group | null = null
  private envKey = ''
  private last = performance.now()
  private readonly key: THREE.DirectionalLight
  private frameTimes: number[] = []
  private pixelRatio: number
  private readonly maxPixelRatio: number
  private readonly focusPoint = new THREE.Vector3()
  private readonly lastFocus = new THREE.Vector3()
  private transition: { from: THREE.Vector3; to: THREE.Vector3; fromTarget: THREE.Vector3; toTarget: THREE.Vector3; t: number } | null = null
  private labels = new Map<string, LabelEntry>()
  private stepFrames = 0
  private listeners = new Set<(dt: number) => void>()
  reducedMotion = false

  constructor(container: HTMLElement) {
    this.container = container
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: false })
    this.maxPixelRatio = Math.min(2, window.devicePixelRatio || 1)
    this.pixelRatio = this.maxPixelRatio
    this.renderer.setPixelRatio(this.pixelRatio)
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.05
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFShadowMap
    this.renderer.xr.enabled = true
    this.renderer.domElement.setAttribute('aria-hidden', 'true')
    container.appendChild(this.renderer.domElement)

    this.labelLayer = document.createElement('div')
    this.labelLayer.className = 'stage-labels'
    container.appendChild(this.labelLayer)

    const hemi = new THREE.HemisphereLight(0xeef3ff, 0x30343a, 1.15)
    this.scene.add(hemi)
    this.key = new THREE.DirectionalLight(0xffffff, 2.1)
    this.key.position.set(6, 12, 5)
    this.key.castShadow = true
    this.key.shadow.mapSize.set(1024, 1024)
    this.key.shadow.camera.near = 1
    this.key.shadow.camera.far = 60
    const sc = this.key.shadow.camera
    sc.left = -12
    sc.right = 12
    sc.top = 12
    sc.bottom = -12
    this.key.shadow.bias = -0.0005
    this.scene.add(this.key)
    this.scene.add(this.key.target)
    const fill = new THREE.DirectionalLight(0xbfd2ff, 0.6)
    fill.position.set(-8, 5, -6)
    this.scene.add(fill)

    this.camera.position.set(4.5, 1.8, 3.5)
    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.08
    this.controls.minDistance = 0.6
    this.controls.maxDistance = 120
    this.controls.maxPolarAngle = Math.PI * 0.495
    this.controls.target.set(0, 1, 0)
    this.controls.addEventListener('start', () => {
      if (this.preset !== 'firstPerson') this.preset = 'free'
      this.transition = null
    })

    const ro = new ResizeObserver(() => this.resize())
    ro.observe(container)
    this.resize()
    this.applyTheme()
    this.renderer.setAnimationLoop(() => this.frame())
  }

  /** Background follows the page theme. */
  applyTheme(): void {
    const css = getComputedStyle(document.documentElement)
    const bg = css.getPropertyValue('--stage-bg').trim() || '#20242a'
    this.scene.background = new THREE.Color(bg)
    this.scene.fog = new THREE.Fog(new THREE.Color(bg), 45, 160)
  }

  setEnvironment(kind: EnvKind, opts: EnvOptions = {}): void {
    const key = `${kind}:${JSON.stringify(opts)}`
    if (key === this.envKey) return
    if (this.env) {
      this.scene.remove(this.env)
      this.env.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose()
          const m = o.material as THREE.Material & { map?: THREE.Texture }
          m.map?.dispose()
          m.dispose()
        }
      })
    }
    this.env = buildEnvironment(kind, opts)
    this.envKey = key
    this.scene.add(this.env)
  }

  setController(c: StageController | null): void {
    this.controller?.dispose()
    this.controller = c
    this.clearLabels()
    this.paused = false
    this.timeScale = 1
    this.follow = true
    if (c) {
      c.focus(this.lastFocus)
      this.setPreset(this.preset === 'free' ? 'broadcast' : this.preset, true)
    }
  }

  get stage(): StageController | null {
    return this.controller
  }

  onFrame(fn: (dt: number) => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  /** Advance one frame (1/60 s) while paused. */
  step(frames = 1): void {
    this.stepFrames += frames
  }

  setPreset(preset: CameraPreset, instant = false): void {
    this.preset = preset
    this.controls.enabled = preset !== 'firstPerson'
    if (preset === 'firstPerson' || preset === 'free' || !this.controller) return
    const focus = this.controller.focus(new THREE.Vector3())
    const yaw = this.controller.facing?.() ?? 0
    const k = this.controller.framing?.() ?? 1
    const custom = preset === 'broadcast' ? this.controller.broadcastOffset?.() : undefined
    const offset = custom ?? (preset === 'broadcast' ? new THREE.Vector3(5.8 * k, 1.5 + 0.5 * k, 0.8 * k) : preset === 'behind' ? new THREE.Vector3(0, 1.4 + 0.3 * k, -4.6 * k) : new THREE.Vector3(0, 9 * k + 3, -0.01))
    if (!custom) offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw)
    const to = focus.clone().add(offset)
    if (instant || this.reducedMotion) {
      this.camera.position.copy(to)
      this.controls.target.copy(focus)
      this.transition = null
    } else {
      this.transition = { from: this.camera.position.clone(), to, fromTarget: this.controls.target.clone(), toTarget: focus.clone(), t: 0 }
    }
    this.lastFocus.copy(focus)
  }

  /** Put the camera at a fixed spot (photo finish, strike-zone view). Stops following. */
  setCamera(position: THREE.Vector3, target: THREE.Vector3): void {
    this.preset = 'free'
    this.follow = false
    this.transition = null
    this.controls.enabled = true
    this.camera.position.copy(position)
    this.controls.target.copy(target)
  }

  /** Keyboard orbit and zoom for the focused stage. Returns true when handled. */
  handleKey(e: KeyboardEvent): boolean {
    if (this.preset === 'firstPerson') return false
    const offset = this.camera.position.clone().sub(this.controls.target)
    const spherical = new THREE.Spherical().setFromVector3(offset)
    const step = e.shiftKey ? 0.2 : 0.08
    switch (e.key) {
      case 'ArrowLeft':
        spherical.theta -= step
        break
      case 'ArrowRight':
        spherical.theta += step
        break
      case 'ArrowUp':
        spherical.phi = Math.max(0.15, spherical.phi - step)
        break
      case 'ArrowDown':
        spherical.phi = Math.min(Math.PI * 0.49, spherical.phi + step)
        break
      case '+':
      case '=':
        spherical.radius = Math.max(this.controls.minDistance, spherical.radius * 0.88)
        break
      case '-':
      case '_':
        spherical.radius = Math.min(this.controls.maxDistance, spherical.radius * 1.12)
        break
      default:
        return false
    }
    this.preset = 'free'
    this.transition = null
    this.camera.position.copy(this.controls.target).add(new THREE.Vector3().setFromSpherical(spherical))
    return true
  }

  addLabel(id: string, el: HTMLElement, get: (out: THREE.Vector3) => THREE.Vector3 | null): void {
    this.removeLabel(id)
    el.classList.add('stage-label')
    this.labelLayer.appendChild(el)
    this.labels.set(id, { el, get })
  }

  removeLabel(id: string): void {
    const entry = this.labels.get(id)
    entry?.el.remove()
    this.labels.delete(id)
  }

  clearLabels(): void {
    for (const id of [...this.labels.keys()]) this.removeLabel(id)
  }

  private resize(): void {
    const w = Math.max(1, this.container.clientWidth)
    const h = Math.max(1, this.container.clientHeight)
    this.renderer.setSize(w, h, false)
    this.renderer.domElement.style.width = '100%'
    this.renderer.domElement.style.height = '100%'
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }

  private adapt(dtMs: number): void {
    // Hold 60 fps: drop resolution when frames run long, restore it when there is headroom.
    this.frameTimes.push(dtMs)
    if (this.frameTimes.length < 60) return
    const avg = this.frameTimes.reduce((s, x) => s + x, 0) / this.frameTimes.length
    this.frameTimes = []
    this.fps = Math.round(1000 / avg)
    if (avg > 19 && this.pixelRatio > 0.75) this.pixelRatio = Math.max(0.75, this.pixelRatio - 0.25)
    else if (avg < 13 && this.pixelRatio < this.maxPixelRatio) this.pixelRatio = Math.min(this.maxPixelRatio, this.pixelRatio + 0.25)
    else return
    this.renderer.setPixelRatio(this.pixelRatio)
    this.resize()
  }

  private readonly tmp = new THREE.Vector3()
  private readonly tmp2 = new THREE.Vector3()

  private frame(): void {
    const now = performance.now()
    const raw = Math.min(0.1, (now - this.last) / 1000)
    this.last = now
    this.adapt(raw * 1000)
    let dt = 0
    if (!this.paused) dt = raw * this.timeScale
    else if (this.stepFrames > 0) {
      dt = (1 / 60) * this.stepFrames
      this.stepFrames = 0
    }
    if (this.controller && !this.renderer.xr.isPresenting) {
      this.controller.update(dt)
      this.controller.focus(this.focusPoint)
      if (this.transition) {
        this.transition.t = Math.min(1, this.transition.t + raw / 0.6)
        const k = this.transition.t * this.transition.t * (3 - 2 * this.transition.t)
        // Track a moving focus during the move as well.
        this.tmp.copy(this.focusPoint).sub(this.transition.toTarget)
        this.camera.position.lerpVectors(this.transition.from, this.transition.to, k).add(this.tmp.clone().multiplyScalar(k))
        this.controls.target.lerpVectors(this.transition.fromTarget, this.transition.toTarget, k).add(this.tmp.multiplyScalar(k))
        if (this.transition.t >= 1) {
          this.transition = null
          this.lastFocus.copy(this.focusPoint)
        }
      } else if (this.preset === 'firstPerson') {
        const rig = this.controller.focusRig?.()
        if (rig) {
          const head = rig.joints.head
          head.getWorldPosition(this.tmp)
          const q = head.getWorldQuaternion(new THREE.Quaternion())
          const fwd = this.tmp2.set(0, -0.08, 1).applyQuaternion(q).normalize()
          this.camera.position.copy(this.tmp).add(new THREE.Vector3(0, 0.07 * rig.dims.height, 0)).addScaledVector(fwd, 0.12)
          this.camera.lookAt(this.camera.position.clone().addScaledVector(fwd, 10))
        }
      } else if (this.follow) {
        this.tmp.copy(this.focusPoint).sub(this.lastFocus)
        this.camera.position.add(this.tmp)
        this.controls.target.add(this.tmp)
        this.lastFocus.copy(this.focusPoint)
      }
      // Keep the shadow camera on the action.
      this.key.target.position.copy(this.focusPoint)
      this.key.position.copy(this.focusPoint).add(new THREE.Vector3(6, 12, 5))
    }
    if (this.preset !== 'firstPerson') this.controls.update()
    for (const fn of this.listeners) fn(dt)
    this.renderer.render(this.scene, this.camera)
    this.updateLabels()
  }

  private updateLabels(): void {
    if (this.labels.size === 0) return
    const w = this.container.clientWidth
    const h = this.container.clientHeight
    for (const { el, get } of this.labels.values()) {
      const p = get(this.tmp)
      if (!p) {
        el.style.display = 'none'
        continue
      }
      p.project(this.camera)
      if (p.z > 1 || p.z < -1) {
        el.style.display = 'none'
        continue
      }
      el.style.display = ''
      el.style.transform = `translate(-50%, -100%) translate(${((p.x + 1) / 2) * w}px, ${((1 - p.y) / 2) * h}px)`
    }
  }

  get canvas(): HTMLCanvasElement {
    return this.renderer.domElement
  }
}
