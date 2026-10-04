import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * WCAG 2.2 contrast checks computed from the actual tokens in globals.css, so a token change that
 * breaks AAA (7:1 for text) or the 3:1 non-text minimum fails CI.
 */
const css = readFileSync(fileURLToPath(new URL('../../src/app/globals.css', import.meta.url)), 'utf8')

function block(selector: string): Record<string, string> {
  const start = css.indexOf(selector)
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start))
  return Object.fromEntries([...body.matchAll(/--([a-z-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1]!, m[2]!.toLowerCase()]))
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi! + 0.05) / (lo! + 0.05)
}

const themes = { dark: block(':root {'), light: block(":root[data-theme='light']") }

describe.each(Object.entries(themes))('%s theme', (_name, t) => {
  it('defines every token', () => {
    for (const key of ['bg', 'surface', 'fg', 'fg-muted', 'accent', 'on-accent', 'accent-text', 'border-strong', 'danger', 'focus']) {
      expect(t[key], key).toMatch(/^#[0-9a-f]{6}$/)
    }
  })
  it.each([
    ['fg', 'bg'],
    ['fg', 'surface'],
    ['fg-muted', 'bg'],
    ['fg-muted', 'surface'],
    ['on-accent', 'accent'],
    ['accent-text', 'bg'],
    ['danger', 'bg'],
    ['danger', 'surface'],
  ])('text %s on %s meets AAA (7:1)', (fg, bg) => {
    expect(contrast(t[fg]!, t[bg]!)).toBeGreaterThanOrEqual(7)
  })
  it.each([
    ['border-strong', 'bg'],
    ['border-strong', 'surface'],
    ['focus', 'bg'],
  ])('UI boundary %s on %s meets 3:1', (fg, bg) => {
    expect(contrast(t[fg]!, t[bg]!)).toBeGreaterThanOrEqual(3)
  })
})

describe('brand palette', () => {
  it('uses the specified brand colors', () => {
    expect(themes.dark.bg).toBe('#121212')
    expect(themes.dark.surface).toBe('#2d2d2d')
    expect(themes.dark.fg).toBe('#ffffff')
    expect(themes.dark['fg-muted']).toBe('#e0e0e0')
    expect(themes.dark.accent).toBe('#e6ff00')
  })
})
