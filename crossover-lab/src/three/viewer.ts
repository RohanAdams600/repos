import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { buildEnvironment, lightingFor, type EnvKind, type EnvOptions } from './env'
import type { Rig } from './rig'

export type CameraPreset = 'broadcast' | 'sideline' | 'behind' | 'overhead' | 'closeup' | 'firstPerson' | 'free'

export const PRESET_LABEL: Record<CameraPreset, string> = {
  broadcast: 'Broadcast',
  sideline: 'Sideline',
  behind: 'Behind',
  overhead: 'Overhead',
  closeup: 'Close-up',
  firstPerson: 'First person',
  free: 'Free orbit',
}

/** Lighting moods: a neutral studio, daylight, a night game under lights, and an indoor arena. */
export type Lighting = 'studio' | 'day' | 'night' | 'arena'

interface LightingSpec {
  sky: number | null
  ground: number
  hemi: number
  key: number
  keyColor: number
  fill: number
  rim: number
  env: number
  exposure: number
  fog: [number, number] | null
}

const LIGHTING: Record<Lighting, LightingSpec> = {
  studio: { sky: null, ground: 0x30343a, hemi: 0.55, key: 2.4, keyColor: 0xfff4e6, fill: 0.45, rim: 1.4, env: 0.5, exposure: 1.0, fog: [45, 160] },
  day: { sky: 0x9cc3e8, ground: 0x3f5a35, hemi: 0.9, key: 3.0, keyColor: 0xfff1dc, fill: 0.4, rim: 0.9, env: 0.6, exposure: 1.0, fog: [140, 420] },
  night: { sky: 0x0b1020, ground: 0x1d2a1d, hemi: 0.35, key: 2.6, keyColor: 0xf3f6ff, fill: 0.7, rim: 1.6, env: 0.45, exposure: 1.1, fog: [120, 380] },
  arena: { sky: 0x101318, ground: 0x2a2219, hemi: 0.4, key: 2.4, keyColor: 0xfff7ea, fill: 0.8, rim: 1.4, env: 0.5, exposure: 1.05, fog: [60, 160] },
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
  /** World box around everyone on stage, for auto-framing. */
  bounds?(out: THREE.Box3): THREE.Box3
  /**
   * Two focus points for a split screen: each half of the frame follows one with the same camera
   * offset, so both athletes are seen from exactly the same angle and distance.
   */
  splitFocus?(): [THREE.Vector3, THREE.Vector3] | null
  dispose(): void
}

interface LabelEntry {
  el: HTMLElement
  get: (out: THREE.Vector3) => THREE.Vector3 | null
  /** In split screen: which half the label belongs to. */
  side?: 0 | 1
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
  private readonly fill: THREE.DirectionalLight
  private readonly rim: THREE.DirectionalLight
  private readonly hemi: THREE.HemisphereLight
  lighting: Lighting = 'studio'
  /** When set, setEnvironment leaves the lighting alone. */
  lightingLocked = false
  private readonly splitCams: [THREE.PerspectiveCamera, THREE.PerspectiveCamera] = [new THREE.PerspectiveCamera(42, 1, 0.03, 600), new THREE.PerspectiveCamera(42, 1, 0.03, 600)]
  private splitActive = false
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

    // Image-based lighting: a neutral room reflected in skin, shells, leather and metal.
    const pmrem = new THREE.PMREMGenerator(this.renderer)
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    pmrem.dispose()
    this.hemi = new THREE.HemisphereLight(0xeef3ff, 0x30343a, 0.55)
    this.scene.add(this.hemi)
    this.key = new THREE.DirectionalLight(0xfff4e6, 2.4)
    this.key.position.set(6, 12, 5)
    this.key.castShadow = true
    this.key.shadow.mapSize.set(2048, 2048)
    this.key.shadow.camera.near = 1
    this.key.shadow.camera.far = 60
    this.setShadowSpan(8)
    this.key.shadow.bias = -0.0004
    this.key.shadow.normalBias = 0.02
    this.key.shadow.radius = 3
    this.scene.add(this.key)
    this.scene.add(this.key.target)
    this.fill = new THREE.DirectionalLight(0xbfd2ff, 0.45)
    this.fill.position.set(-8, 5, -6)
    this.scene.add(this.fill)
    // Rim light from behind and above: separates the figure from the background.
    this.rim = new THREE.DirectionalLight(0xcfe0ff, 1.4)
    this.rim.position.set(-4, 7, -8)
    this.scene.add(this.rim)
    this.scene.add(this.rim.target)

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

  /** Studio background follows the page theme; venues use their own sky. */
  applyTheme(): void {
    this.setLighting(this.lighting)
  }

  /** Set the lighting mood (background, sky light, key, fill, rim, reflections, exposure). */
  setLighting(mode: Lighting): void {
    this.lighting = mode
    const L = LIGHTING[mode]
    const css = getComputedStyle(document.documentElement)
    const bg = L.sky !== null ? new THREE.Color(L.sky) : new THREE.Color(css.getPropertyValue('--stage-bg').trim() || '#20242a')
    this.scene.background = bg
    this.scene.fog = L.fog ? new THREE.Fog(bg, L.fog[0], L.fog[1]) : null
    this.hemi.color.set(L.sky ?? 0xeef3ff)
    this.hemi.groundColor.set(L.ground)
    this.hemi.intensity = L.hemi
    this.key.color.set(L.keyColor)
    this.key.intensity = L.key
    this.fill.intensity = L.fill
    this.rim.intensity = L.rim
    this.scene.environmentIntensity = L.env
    this.renderer.toneMappingExposure = L.exposure
  }

  /** Fit the key light's shadow camera to the action so shadows stay crisp. */
  private setShadowSpan(span: number): void {
    const sc = this.key.shadow.camera
    sc.left = -span
    sc.right = span
    sc.top = span
    sc.bottom = -span
    sc.updateProjectionMatrix()
  }

  /** Spin the camera slowly around the athlete (the showroom turntable). */
  set turntable(on: boolean) {
    this.controls.autoRotate = on && !this.reducedMotion
    this.controls.autoRotateSpeed = 1.6
  }

  get turntable(): boolean {
    return this.controls.autoRotate
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
    if (!this.lightingLocked) this.setLighting(lightingFor(kind, opts))
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
    const offset =
      custom ??
      (preset === 'broadcast'
        ? new THREE.Vector3(5.8 * k, 1.5 + 0.5 * k, 0.8 * k)
        : preset === 'sideline'
          ? new THREE.Vector3(3.6 * k, 0.35, 1.2 * k)
          : preset === 'behind'
            ? new THREE.Vector3(0, 1.4 + 0.3 * k, -4.6 * k)
            : preset === 'closeup'
              ? new THREE.Vector3(0.9, 0.25, 1.5)
              : new THREE.Vector3(0, 9 * k + 3, -0.01))
    if (!custom) offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw)
    if (preset === 'closeup') {
      // Head and shoulders of the main athlete.
      const rig = this.controller.focusRig?.()
      if (rig) rig.focusPoint('face', focus).y -= 0.12 * rig.dims.height
    } else if (!custom && k === 1 && this.controller.bounds) {
      // Auto-frame: back off just far enough for everyone on stage to fit.
      const box = this.controller.bounds(new THREE.Box3())
      if (!box.isEmpty()) offset.setLength(Math.max(preset === 'sideline' ? 2.4 : 2.8, this.fitDistance(box) * (preset === 'overhead' ? 1.25 : 1)))
    }
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

  /** Camera distance at which a box fits the frame with a small margin. */
  fitDistance(box: THREE.Box3): number {
    const size = box.getSize(new THREE.Vector3())
    const vfov = (this.camera.fov * Math.PI) / 180
    const aspect = this.splitActive ? this.camera.aspect / 2 : this.camera.aspect
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * aspect)
    const byHeight = (size.y * 0.5) / Math.tan(vfov / 2)
    const byWidth = (Math.max(size.x, size.z) * 0.5) / Math.tan(hfov / 2)
    return Math.max(byHeight, byWidth) * 1.32 + Math.min(size.x, size.z) * 0.5
  }

  /** Frame a point from a direction at a distance (showroom zoom targets). Keeps following. */
  frameTarget(target: THREE.Vector3, direction: THREE.Vector3, distance: number, instant = false): void {
    this.preset = 'free'
    this.controls.enabled = true
    const to = target.clone().addScaledVector(direction.clone().normalize(), distance)
    if (instant || this.reducedMotion) {
      this.camera.position.copy(to)
      this.controls.target.copy(target)
      this.transition = null
    } else {
      this.transition = { from: this.camera.position.clone(), to, fromTarget: this.controls.target.clone(), toTarget: target.clone(), t: 0 }
    }
    this.controller?.focus(this.lastFocus)
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

  addLabel(id: string, el: HTMLElement, get: (out: THREE.Vector3) => THREE.Vector3 | null, side?: 0 | 1): void {
    this.removeLabel(id)
    el.classList.add('stage-label')
    this.labelLayer.appendChild(el)
    this.labels.set(id, { el, get, ...(side !== undefined ? { side } : {}) })
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
      // Keep the shadow camera on the action, sized to it.
      this.key.target.position.copy(this.focusPoint)
      this.key.position.copy(this.focusPoint).add(new THREE.Vector3(6, 12, 5))
      this.rim.target.position.copy(this.focusPoint)
      const span = 8 * Math.max(1, Math.min(4, this.controller.framing?.() ?? 1))
      if (this.key.shadow.camera.right !== span) this.setShadowSpan(span)
    }
    if (this.preset !== 'firstPerson') this.controls.update()
    for (const fn of this.listeners) fn(dt)
    const pair = this.controller && !this.renderer.xr.isPresenting ? this.controller.splitFocus?.() : null
    this.splitActive = Boolean(pair)
    if (pair) this.renderSplit(pair)
    else this.renderer.render(this.scene, this.camera)
    this.updateLabels()
  }

  /** Two matched views side by side: same offset and lens, each on its own athlete. */
  private renderSplit(pair: [THREE.Vector3, THREE.Vector3]): void {
    const size = this.renderer.getSize(new THREE.Vector2())
    const half = Math.floor(size.x / 2)
    const offset = this.camera.position.clone().sub(this.controls.target)
    const lookOffset = this.controls.target.clone().sub(this.focusPoint)
    this.renderer.setScissorTest(true)
    pair.forEach((focus, i) => {
      const cam = this.splitCams[i]!
      cam.fov = this.camera.fov
      cam.near = this.camera.near
      cam.far = this.camera.far
      cam.aspect = half / Math.max(1, size.y)
      cam.updateProjectionMatrix()
      const target = focus.clone().add(lookOffset)
      cam.position.copy(target).add(offset)
      cam.lookAt(target)
      this.renderer.setViewport(i * half, 0, half, size.y)
      this.renderer.setScissor(i * half, 0, half, size.y)
      this.renderer.render(this.scene, cam)
    })
    this.renderer.setScissorTest(false)
    this.renderer.setViewport(0, 0, size.x, size.y)
  }

  private updateLabels(): void {
    if (this.labels.size === 0) return
    const w = this.container.clientWidth
    const h = this.container.clientHeight
    for (const { el, get, side } of this.labels.values()) {
      const p = get(this.tmp)
      if (!p) {
        el.style.display = 'none'
        continue
      }
      const split = this.splitActive && side !== undefined
      p.project(split ? this.splitCams[side]! : this.camera)
      if (p.z > 1 || p.z < -1) {
        el.style.display = 'none'
        continue
      }
      el.style.display = ''
      const x = split ? side * (w / 2) + ((p.x + 1) / 2) * (w / 2) : ((p.x + 1) / 2) * w
      el.style.transform = `translate(-50%, -100%) translate(${x}px, ${((1 - p.y) / 2) * h}px)`
    }
  }

  get canvas(): HTMLCanvasElement {
    return this.renderer.domElement
  }
}
