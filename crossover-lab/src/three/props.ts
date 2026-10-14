import * as THREE from 'three'

/** Balls, bat and barbell. Plain materials, no markings or logos. */
export function makeFootball(): THREE.Mesh {
  const geo = new THREE.SphereGeometry(0.085, 18, 12)
  geo.scale(0.62, 0.62, 1.32)
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x7a3f1d, roughness: 0.7 }))
  mesh.castShadow = true
  return mesh
}

export function makeBaseball(): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.0366, 14, 10), new THREE.MeshStandardMaterial({ color: 0xf2efe6, roughness: 0.6 }))
  mesh.castShadow = true
  return mesh
}

export function makeBasketball(): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.12, 20, 14), new THREE.MeshStandardMaterial({ color: 0xc8571d, roughness: 0.8 }))
  mesh.castShadow = true
  return mesh
}

/** Bat along +Y from the knob (origin) to the barrel end. */
export function makeBat(): THREE.Group {
  const g = new THREE.Group()
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.012, 0.45, 10), new THREE.MeshStandardMaterial({ color: 0xc9a46a, roughness: 0.5 }))
  handle.position.y = 0.25
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.033, 0.016, 0.4, 14), new THREE.MeshStandardMaterial({ color: 0xc9a46a, roughness: 0.5 }))
  barrel.position.y = 0.66
  const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.02, 10), new THREE.MeshStandardMaterial({ color: 0x8b6b3f }))
  knob.position.y = 0.02
  for (const m of [handle, barrel, knob]) {
    m.castShadow = true
    g.add(m)
  }
  return g
}

/** Olympic bar with plates sized to the load (45 lb bar). Bar along X. */
export function makeBarbell(loadLb: number): THREE.Group {
  const g = new THREE.Group()
  const steel = new THREE.MeshStandardMaterial({ color: 0x9ea3a8, metalness: 0.7, roughness: 0.35 })
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 2.2, 10), steel)
  bar.rotation.z = Math.PI / 2
  bar.castShadow = true
  g.add(bar)
  const plates = platesFor(loadLb)
  const colors: Record<number, number> = { 45: 0x1f4e9a, 35: 0xd4a514, 25: 0x2f7d32, 10: 0xe8e8e8, 5: 0x3a3a3a, 2.5: 0x8c8c8c }
  for (const side of [-1, 1]) {
    let x = 0.72
    for (const w of plates) {
      const r = w >= 25 ? 0.225 : w >= 10 ? 0.16 : 0.11
      const thick = w >= 25 ? 0.05 : 0.03
      const plate = new THREE.Mesh(new THREE.CylinderGeometry(r, r, thick, 24), new THREE.MeshStandardMaterial({ color: colors[w] ?? 0x555555, roughness: 0.6 }))
      plate.rotation.z = Math.PI / 2
      plate.position.x = side * (x + thick / 2)
      plate.castShadow = true
      g.add(plate)
      x += thick + 0.004
    }
  }
  g.userData.load = loadLb
  return g
}

/** Plates per side for a load on a 45 lb bar. */
export function platesFor(loadLb: number): number[] {
  let perSide = Math.max(0, (loadLb - 45) / 2)
  const out: number[] = []
  for (const w of [45, 35, 25, 10, 5, 2.5]) {
    while (perSide >= w - 1e-9 && out.length < 12) {
      out.push(w)
      perSide -= w
    }
  }
  return out
}
