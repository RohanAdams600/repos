import { describe, expect, it } from 'vitest'
import { findingText, findingTitle } from '@/i18n/messages/analysis'
import { SERVER_TEXT_ES, hasPattern, translateServerText } from '@/i18n/messages/server-text'
import { renderLocalizedEmail, withLocale } from '@/lib/email/localized'
import { contactMessageProblem } from '@/lib/coach/rules'
import type { Finding, FindingCode, KinematicReport } from '@/lib/biomechanics/types'

const report = {
  peaks: [
    { segment: 'pelvis', time: 0.5, speedDegPerSec: 600 },
    { segment: 'torso', time: 0.47, speedDegPerSec: 800 },
    { segment: 'arm', time: 0.44, speedDegPerSec: 1200 },
    { segment: 'hand', time: 0.42, speedDegPerSec: 1500 },
  ],
  separationAtFootStrikeDeg: 6,
} as Pick<KinematicReport, 'peaks' | 'separationAtFootStrikeDeg'>

const CODES: FindingCode[] = ['TRUNK_LEADS_PELVIS', 'ARM_LEADS_TRUNK', 'HAND_LEADS_ARM', 'LOW_HIP_SHOULDER_SEPARATION', 'SEGMENTS_FIRE_TOGETHER', 'NO_SPEED_GAIN_PELVIS_TO_TRUNK']

describe('analysis findings in Spanish', () => {
  const finding = (code: FindingCode): Finding => ({ code, severity: 'high', title: 'English title', detail: 'English detail', focus: 'English focus' })

  it('keeps the stored English text for English readers', () => {
    expect(findingText(finding('ARM_LEADS_TRUNK'), report, 'PITCH', 'en')).toMatchObject({ title: 'English title', detail: 'English detail' })
  })

  it('rebuilds every finding in Spanish with the measured values', () => {
    for (const code of CODES) {
      const text = findingText(finding(code), report, 'SWING', 'es')
      expect(text.title).not.toBe('English title')
      expect(text.detail.length).toBeGreaterThan(20)
      expect(text.focus.length).toBeGreaterThan(20)
    }
    expect(findingText(finding('TRUNK_LEADS_PELVIS'), report, 'SWING', 'es').detail).toContain('30 ms')
    expect(findingText(finding('LOW_HIP_SHOULDER_SEPARATION'), report, 'HOCKEY_SHOT', 'es').detail).toContain('6 grados')
    expect(findingTitle({ code: 'HAND_LEADS_ARM', title: 'x', severity: 'medium' }, 'HOCKEY_SHOT', 'es')).toBe('Las manos y el palo llegan a su pico antes que el brazo')
  })
})

describe('emails in the recipient’s language', () => {
  const message = {
    subject: { en: 'Hello', es: 'Hola' },
    paragraphs: [{ en: 'First line.', es: 'Primera línea.' }, 'A name stays as written'],
    action: { label: { en: 'Open', es: 'Abrir' }, url: 'https://kineticscout.example/dashboard?x=1' },
  }

  it('renders the English version unchanged', () => {
    const out = renderLocalizedEmail(message, 'en')
    expect(out.subject).toBe('Hello')
    expect(out.text).toContain('Open: https://kineticscout.example/dashboard?x=1')
    expect(out.html).toContain('lang="en"')
  })

  it('renders the Spanish version, marks its language, and opens links in Spanish', () => {
    const out = renderLocalizedEmail(message, 'es')
    expect(out.subject).toBe('Hola')
    expect(out.text).toContain('Primera línea.')
    expect(out.text).toContain('A name stays as written')
    expect(out.text).toContain('Abrir: https://kineticscout.example/dashboard?x=1&lang=es')
    expect(out.html).toContain('lang="es"')
  })

  it('adds the language only to Spanish links', () => {
    expect(withLocale('https://a.example/p?token=abc', 'en')).toBe('https://a.example/p?token=abc')
    expect(withLocale('https://a.example/p?token=abc', 'es')).toBe('https://a.example/p?token=abc&lang=es')
  })
})

describe('messages built in code', () => {
  it('translates every first-message problem a coach can see', () => {
    const samples = ['too short', `${'a'.repeat(30)} https://example.com`, `${'a'.repeat(30)} call 555-123-4567`, 'a'.repeat(5000)]
    for (const sample of samples) {
      const problem = contactMessageProblem(sample)
      expect(problem).not.toBeNull()
      expect(problem! in SERVER_TEXT_ES || hasPattern(problem!)).toBe(true)
      expect(translateServerText(problem!, 'es')).not.toBe(problem)
    }
  })

  it('translates labels the server builds from data', () => {
    expect(translateServerText('Class of 2027', 'es')).toBe('Generación 2027')
    expect(translateServerText('Your clip from 2026-09-30', 'es')).toBe('Tu clip del 2026-09-30')
  })
})
