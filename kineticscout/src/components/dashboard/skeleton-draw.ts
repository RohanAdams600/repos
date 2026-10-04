import { SKELETON_EDGES } from '@/lib/biomechanics/codec'
import type { PoseFrame } from '@/lib/biomechanics/types'

/** Frame closest to time t, or null across tracking gaps longer than 100 ms. */
export function nearestFrame(frames: PoseFrame[], t: number): PoseFrame | null {
  if (!frames.length) return null
  let lo = 0
  let hi = frames.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (frames[mid]!.t < t) lo = mid + 1
    else hi = mid
  }
  const candidate = frames[lo]!
  const previous = frames[lo - 1]
  const best = previous && Math.abs(previous.t - t) < Math.abs(candidate.t - t) ? previous : candidate
  return Math.abs(best.t - t) <= 0.1 ? best : null
}

/** Clears the canvas (sized to its CSS box at device pixel ratio) and draws the skeleton for one frame. */
export function drawSkeleton(canvas: HTMLCanvasElement, context: CanvasRenderingContext2D, frame: PoseFrame | null): void {
  const { clientWidth: w, clientHeight: h } = canvas
  const dpr = window.devicePixelRatio || 1
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr)
    canvas.height = Math.round(h * dpr)
  }
  context.setTransform(dpr, 0, 0, dpr, 0, 0)
  context.clearRect(0, 0, w, h)
  if (!frame) return
  const point = (name: keyof PoseFrame['keypoints']) => {
    const kp = frame.keypoints[name]
    return kp && kp.score >= 0.3 ? { x: kp.x * w, y: kp.y * h } : null
  }
  // Dark underlay keeps the volt skeleton visible on bright and dark footage alike.
  for (const [width, color] of [
    [6, 'rgba(18,18,18,0.85)'],
    [3, '#E6FF00'],
  ] as const) {
    context.lineWidth = width
    context.strokeStyle = color
    context.lineCap = 'round'
    for (const [a, b] of SKELETON_EDGES) {
      const p = point(a)
      const q = point(b)
      if (!p || !q) continue
      context.beginPath()
      context.moveTo(p.x, p.y)
      context.lineTo(q.x, q.y)
      context.stroke()
    }
  }
  for (const name of Object.keys(frame.keypoints) as (keyof PoseFrame['keypoints'])[]) {
    const p = point(name)
    if (!p) continue
    context.beginPath()
    context.arc(p.x, p.y, 4, 0, Math.PI * 2)
    context.fillStyle = '#E6FF00'
    context.fill()
    context.lineWidth = 2
    context.strokeStyle = '#121212'
    context.stroke()
  }
}
