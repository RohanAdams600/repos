import type { BodySegment } from '../data/types'
import { s } from './dom'

/**
 * Front-view body map, drawn from simple shapes. The viewer faces the athlete, so the athlete's
 * left side is on the right of the drawing (as on a medical chart); the labels say so.
 */
const SHAPES: Record<BodySegment, { kind: 'rect' | 'ellipse'; x: number; y: number; w: number; h: number }> = {
  head: { kind: 'ellipse', x: 100, y: 26, w: 34, h: 40 },
  neck: { kind: 'rect', x: 92, y: 46, w: 16, h: 12 },
  chest: { kind: 'rect', x: 70, y: 58, w: 60, h: 52 },
  abdomen: { kind: 'rect', x: 74, y: 110, w: 52, h: 34 },
  pelvis: { kind: 'rect', x: 72, y: 144, w: 56, h: 26 },
  upperArmR: { kind: 'rect', x: 50, y: 60, w: 18, h: 56 },
  upperArmL: { kind: 'rect', x: 132, y: 60, w: 18, h: 56 },
  forearmR: { kind: 'rect', x: 44, y: 118, w: 16, h: 52 },
  forearmL: { kind: 'rect', x: 140, y: 118, w: 16, h: 52 },
  handR: { kind: 'ellipse', x: 50, y: 182, w: 16, h: 20 },
  handL: { kind: 'ellipse', x: 150, y: 182, w: 16, h: 20 },
  thighR: { kind: 'rect', x: 74, y: 172, w: 24, h: 72 },
  thighL: { kind: 'rect', x: 102, y: 172, w: 24, h: 72 },
  shinR: { kind: 'rect', x: 76, y: 248, w: 20, h: 70 },
  shinL: { kind: 'rect', x: 104, y: 248, w: 20, h: 70 },
  footR: { kind: 'ellipse', x: 84, y: 328, w: 26, h: 12 },
  footL: { kind: 'ellipse', x: 116, y: 328, w: 26, h: 12 },
}

export const SEGMENT_LABEL: Record<BodySegment, string> = {
  head: 'Head',
  neck: 'Neck',
  chest: 'Chest and shoulders',
  abdomen: 'Core',
  pelvis: 'Hips and groin',
  upperArmL: 'Left upper arm and elbow',
  upperArmR: 'Right upper arm and elbow',
  forearmL: 'Left forearm',
  forearmR: 'Right forearm',
  handL: 'Left hand',
  handR: 'Right hand',
  thighL: 'Left thigh and knee',
  thighR: 'Right thigh and knee',
  shinL: 'Left lower leg, knee and ankle',
  shinR: 'Right lower leg, knee and ankle',
  footL: 'Left foot and ankle',
  footR: 'Right foot and ankle',
}

export function bodyMap(marks: { segment: BodySegment; surgery?: boolean; label: string }[], title: string): SVGSVGElement {
  const svg = s('svg', { class: 'bodymap', viewBox: '0 0 200 350', role: 'img', 'aria-label': title })
  const hit = new Map<BodySegment, { surgery: boolean; labels: string[] }>()
  for (const m of marks) {
    const cur = hit.get(m.segment) ?? { surgery: false, labels: [] }
    cur.surgery ||= !!m.surgery
    cur.labels.push(m.label)
    hit.set(m.segment, cur)
  }
  for (const [seg, shape] of Object.entries(SHAPES) as [BodySegment, (typeof SHAPES)[BodySegment]][]) {
    const info = hit.get(seg)
    const cls = `seg-shape${info ? ' hit' : ''}${info?.surgery ? ' surgery' : ''}`
    const title = s('title', null, info ? `${SEGMENT_LABEL[seg]}: ${info.labels.join('; ')}` : SEGMENT_LABEL[seg])
    const el =
      shape.kind === 'ellipse'
        ? s('ellipse', { class: cls, cx: shape.x, cy: shape.y, rx: shape.w / 2, ry: shape.h / 2 }, title)
        : s('rect', { class: cls, x: shape.x, y: shape.y, width: shape.w, height: shape.h, rx: 6 }, title)
    svg.append(el)
  }
  svg.append(s('text', { x: 12, y: 346, style: 'font-size:10px;fill:var(--ink-2)' }, 'R'), s('text', { x: 182, y: 346, style: 'font-size:10px;fill:var(--ink-2)' }, 'L'))
  return svg
}
