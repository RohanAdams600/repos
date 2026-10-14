import * as THREE from 'three'
import type { Athlete } from '../data/types'
import { h, toast } from '../ui/dom'
import { idle } from './motions'
import { Rig } from './rig'
import type { Viewer } from './viewer'

/**
 * Life-size AR. On phones with WebXR AR (Android Chrome) the athlete is placed on a detected
 * floor at true scale. Elsewhere the dialog offers the model as GLB (Android Scene Viewer,
 * desktop viewers) or USDZ (iPhone and iPad Quick Look) in the current gear.
 */
export async function openAR(viewer: Viewer, athlete: Athlete, gear: Record<string, { worn: boolean; variant?: string }>): Promise<void> {
  const xr = (navigator as Navigator & { xr?: XRSystem }).xr
  const supported = xr ? await xr.isSessionSupported('immersive-ar').catch(() => false) : false
  const status = h('p', { class: 'muted' }, supported ? 'Point your phone at the floor, then tap to place the figure at life size.' : 'This device or browser does not offer WebXR AR. Download the model to view it in your phone’s AR viewer.')
  const dialog = h(
    'dialog',
    { 'aria-label': 'View in AR' },
    h(
      'div',
      { class: 'stack' },
      h('h2', null, `${athlete.name} in your room`),
      status,
      h(
        'div',
        { class: 'row' },
        supported ? h('button', { class: 'btn primary', type: 'button', onclick: () => void startSession(viewer, athlete, gear, dialog as HTMLDialogElement) }, 'Start AR') : null,
        h('button', { class: 'btn ghost', type: 'button', onclick: () => void download(athlete, gear, 'glb') }, 'Download GLB'),
        h('button', { class: 'btn ghost', type: 'button', onclick: () => void download(athlete, gear, 'usdz') }, 'Download USDZ (iPhone)'),
        h('button', { class: 'btn ghost', type: 'button', onclick: () => (dialog as HTMLDialogElement).close() }, 'Close'),
      ),
      h('p', { class: 'src' }, 'Generic mannequin in team colors at the athlete’s listed height. Not a likeness.'),
    ),
  ) as HTMLDialogElement
  dialog.addEventListener('close', () => dialog.remove())
  document.body.appendChild(dialog)
  dialog.showModal()
}

function buildRig(athlete: Athlete, gear: Record<string, { worn: boolean; variant?: string }>): Rig {
  const rig = new Rig(athlete)
  for (const [id, state] of Object.entries(gear)) rig.setGear(id, state)
  rig.applyPose(idle(0), { x: 0, z: 0, yaw: 0 })
  return rig
}

async function download(athlete: Athlete, gear: Record<string, { worn: boolean; variant?: string }>, kind: 'glb' | 'usdz'): Promise<void> {
  const rig = buildRig(athlete, gear)
  const scene = new THREE.Scene()
  scene.add(rig.root)
  rig.root.updateMatrixWorld(true)
  let blob: Blob
  try {
    if (kind === 'glb') {
      const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js')
      const result = await new GLTFExporter().parseAsync(scene, { binary: true })
      blob = new Blob([result as ArrayBuffer], { type: 'model/gltf-binary' })
    } else {
      const { USDZExporter } = await import('three/addons/exporters/USDZExporter.js')
      const result = await new USDZExporter().parseAsync(scene)
      blob = new Blob([result], { type: 'model/vnd.usdz+zip' })
    }
  } catch {
    toast('Could not build the model file in this browser.')
    return
  } finally {
    rig.dispose()
  }
  const url = URL.createObjectURL(blob)
  const a = h('a', { href: url, download: `${athlete.id}.${kind}`, rel: kind === 'usdz' ? 'ar' : null })
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

async function startSession(viewer: Viewer, athlete: Athlete, gear: Record<string, { worn: boolean; variant?: string }>, dialog: HTMLDialogElement): Promise<void> {
  const xr = (navigator as Navigator & { xr?: XRSystem }).xr!
  dialog.close()
  const overlay = h('div', { style: { position: 'fixed', inset: '0', pointerEvents: 'none' } }, h('button', { class: 'btn', type: 'button', style: { position: 'absolute', top: '16px', right: '16px', pointerEvents: 'auto' } }, 'Exit AR'))
  document.body.appendChild(overlay)
  let session: XRSession
  try {
    session = await xr.requestSession('immersive-ar', { requiredFeatures: ['hit-test'], optionalFeatures: ['dom-overlay'], domOverlay: { root: overlay } } as XRSessionInit)
  } catch {
    overlay.remove()
    toast('AR could not start on this device.')
    return
  }
  overlay.querySelector('button')!.addEventListener('click', () => void session.end())
  const renderer = viewer.renderer
  const savedBg = viewer.scene.background
  const hidden: THREE.Object3D[] = []
  viewer.scene.children.forEach((c) => {
    if (c.type === 'Group' && c.visible) {
      hidden.push(c)
      c.visible = false
    }
  })
  viewer.scene.background = null
  const rig = buildRig(athlete, gear)
  rig.root.visible = false
  viewer.scene.add(rig.root)
  const reticle = new THREE.Mesh(new THREE.RingGeometry(0.12, 0.16, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff }))
  reticle.matrixAutoUpdate = false
  reticle.visible = false
  viewer.scene.add(reticle)
  renderer.xr.setReferenceSpaceType('local')
  await renderer.xr.setSession(session)
  const viewerSpace = await session.requestReferenceSpace('viewer')
  const hitSource = await session.requestHitTestSource!({ space: viewerSpace })
  let t = 0
  const stop = viewer.onFrame((dt) => {
    t += dt || 1 / 60
    const frame = renderer.xr.getFrame()
    const ref = renderer.xr.getReferenceSpace()
    if (frame && ref && hitSource) {
      const hits = frame.getHitTestResults(hitSource)
      const pose = hits[0]?.getPose(ref)
      reticle.visible = !!pose
      if (pose) reticle.matrix.fromArray(pose.transform.matrix)
    }
    if (rig.root.visible) rig.applyPose(idle(t), { x: rig.root.position.x, z: rig.root.position.z, y: rig.root.position.y, yaw: rig.root.rotation.y })
  })
  session.addEventListener('select', () => {
    if (!reticle.visible) return
    const p = new THREE.Vector3().setFromMatrixPosition(reticle.matrix)
    rig.root.position.copy(p)
    rig.root.visible = true
  })
  session.addEventListener('end', () => {
    stop()
    hitSource?.cancel()
    rig.dispose()
    viewer.scene.remove(reticle)
    reticle.geometry.dispose()
    viewer.scene.background = savedBg
    hidden.forEach((c) => (c.visible = true))
    overlay.remove()
  })
}
