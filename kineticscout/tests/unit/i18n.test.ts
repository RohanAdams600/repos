import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { localeFromAcceptLanguage } from '@/i18n/config'
import { hasPattern, SERVER_TEXT_ES, translateServerText } from '@/i18n/messages/server-text'

describe('language detection', () => {
  it('follows Accept-Language preferences and falls back to English', () => {
    expect(localeFromAcceptLanguage('es-US,es;q=0.9,en;q=0.8')).toBe('es')
    expect(localeFromAcceptLanguage('en-US,en;q=0.9,es;q=0.8')).toBe('en')
    expect(localeFromAcceptLanguage('fr-FR,es;q=0.5')).toBe('es')
    expect(localeFromAcceptLanguage('fr-FR,de;q=0.5')).toBe('en')
    expect(localeFromAcceptLanguage('es;q=0, en')).toBe('en')
    expect(localeFromAcceptLanguage(null)).toBe('en')
  })
})

describe('server messages in Spanish', () => {
  it('translates literals and messages built with values', () => {
    expect(translateServerText('Check the highlighted fields.', 'es')).toBe('Revisa los campos marcados.')
    expect(translateServerText('Check the highlighted fields.', 'en')).toBe('Check the highlighted fields.')
    expect(translateServerText('Exit velocity must be between 30 and 125 mph.', 'es')).toBe('Velocidad de salida debe estar entre 30 y 125 mph.')
    expect(translateServerText('Use at least 12 characters', 'es')).toBe('Usa al menos 12 caracteres')
    expect(translateServerText('Enter your first name', 'es')).toBe('Escribe tu nombre')
    expect(translateServerText('First name is too long', 'es')).toBe('El nombre es demasiado largo')
    expect(translateServerText('Enter a valid start date', 'es')).toBe('Escribe una fecha de inicio válida')
    expect(translateServerText('Give or decline consent for Sam\'s account first.', 'es')).toBe('Primero da o rechaza el consentimiento para la cuenta de Sam.')
  })

  /**
   * Every literal message the server can send to athletes, parents and coaches has a Spanish entry.
   * The staff console is English only, so messages used only there are listed below.
   */
  it('covers every user-facing message literal in server code', () => {
    const STAFF_ONLY_FILES = ['src/server/routers/admin.ts', 'src/lib/insights/norm-admin.ts', 'src/lib/reference/', 'src/lib/training/rules.ts', 'src/lib/env.ts', 'src/lib/marketing/', 'src/lib/content/', 'src/lib/email/', 'src/lib/ai/', 'src/lib/legal.ts', 'src/i18n/']
    const STAFF_ONLY_MESSAGES = new Set([
      'A different staff member must review and publish a drill you wrote.',
      'Only drafts can be published.',
      'Only drafts can be deleted.',
      'Only published drills can be retired.',
      'The licence for this drill has ended.',
      'This coach is not in a state that allows that decision.',
      'This team is not in a state that allows that decision.',
      'This submission was already decided.',
      'Report already resolved.',
      'Staff accounts are removed by the account owner, not from this console.',
      'This asset can no longer be changed.',
      'This draft can no longer be changed.',
      'Record the athlete’s written consent before publishing a case study.',
      'Reviews must come from a KineticScout account holder. No account uses that email.',
      'No account uses that email address.',
      'Confirm the request came from the account holder',
      'Confirm you have the author’s permission to publish',
      'Add a note explaining the decision; the coach sees it.',
      'Add a note explaining why; the person who submitted it sees it.',
    ])
    const files: string[] = []
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = path.join(dir, name)
        if (statSync(p).isDirectory()) walk(p)
        else if (/\.tsx?$/.test(name) && !name.includes('.test.')) files.push(p)
      }
    }
    walk('src/lib')
    walk('src/server')
    const literal = /(?:message|error)\s*:\s*'((?:\\.|[^'\\])+)'|(?:Error|TRPCError)\(\s*'[A-Z_]+'\s*,\s*'((?:\\.|[^'\\])+)'|\.(?:min|max|regex|refine|email|pipe)\([^'`)]*?,\s*'((?:\\.|[^'\\])+)'/g
    const missing: string[] = []
    for (const file of files) {
      if (STAFF_ONLY_FILES.some((prefix) => file.startsWith(prefix))) continue
      const src = readFileSync(file, 'utf8')
      for (const m of src.matchAll(literal)) {
        const text = (m[1] ?? m[2] ?? m[3] ?? '').replace(/\\'/g, "'")
        if (text.length < 4 || !/[a-z] /.test(text) || STAFF_ONLY_MESSAGES.has(text)) continue
        if (!(text in SERVER_TEXT_ES) && !hasPattern(text)) missing.push(`${file}: ${text}`)
      }
    }
    expect(missing).toEqual([])
  })
})
