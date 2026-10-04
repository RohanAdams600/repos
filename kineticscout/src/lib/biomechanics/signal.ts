/** Small numeric helpers for pose time series. Pure and allocation-light. */

export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return Number.NaN
  const sorted = [...values].sort((a, b) => a - b)
  const rank = (p / 100) * (sorted.length - 1)
  const lower = Math.floor(rank)
  const upper = Math.ceil(rank)
  const weight = rank - lower
  return sorted[lower]! * (1 - weight) + sorted[upper]! * weight
}

export function median(values: readonly number[]): number {
  return percentile(values, 50)
}

/** Centered moving average with edge shrinking (no phase shift, so peak timing is preserved). */
export function movingAverage(values: readonly number[], window: number): number[] {
  const half = Math.max(0, Math.floor(window / 2))
  const out = new Array<number>(values.length)
  for (let i = 0; i < values.length; i++) {
    let sum = 0
    let count = 0
    for (let j = Math.max(0, i - half); j <= Math.min(values.length - 1, i + half); j++) {
      sum += values[j]!
      count++
    }
    out[i] = sum / count
  }
  return out
}

/** Central-difference derivative on irregular timestamps. */
export function derivative(values: readonly number[], times: readonly number[]): number[] {
  const n = values.length
  const out = new Array<number>(n).fill(0)
  if (n < 2) return out
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1)
    const b = Math.min(n - 1, i + 1)
    const dt = times[b]! - times[a]!
    out[i] = dt > 0 ? (values[b]! - values[a]!) / dt : 0
  }
  return out
}

/** Removes 2*pi jumps from an angle series in radians. */
export function unwrap(angles: readonly number[]): number[] {
  const out: number[] = []
  let offset = 0
  for (let i = 0; i < angles.length; i++) {
    let value = angles[i]! + offset
    if (i > 0) {
      const previous = out[i - 1]!
      while (value - previous > Math.PI) {
        value -= 2 * Math.PI
        offset -= 2 * Math.PI
      }
      while (value - previous < -Math.PI) {
        value += 2 * Math.PI
        offset += 2 * Math.PI
      }
    }
    out.push(value)
  }
  return out
}

export function argMax(values: readonly number[], from = 0, to = values.length - 1): number {
  let best = from
  for (let i = from; i <= to; i++) if (values[i]! > values[best]!) best = i
  return best
}

export function argMin(values: readonly number[], from = 0, to = values.length - 1): number {
  let best = from
  for (let i = from; i <= to; i++) if (values[i]! < values[best]!) best = i
  return best
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export const RAD_TO_DEG = 180 / Math.PI
