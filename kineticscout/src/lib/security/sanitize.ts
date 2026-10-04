/**
 * Input normalization applied after schema validation.
 *
 * Output encoding is React's job (it escapes all interpolated text) and Markdown is rendered
 * without raw HTML, so these helpers do not try to "escape HTML". They remove characters that
 * have no business in user-entered text: control characters, bidi overrides used for spoofing,
 * and zero-width characters, and they apply Unicode NFKC normalization so look-alike forms
 * compare equal.
 */

// C0/C1 control characters except tab, line feed and carriage return.
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g
// Bidirectional overrides and isolates (Trojan Source style spoofing).
const BIDI_CONTROLS = /[‪-‮⁦-⁩]/g
const ZERO_WIDTH = /[​-‍﻿]/g

export function sanitizeText(input: string, { multiline = false }: { multiline?: boolean } = {}): string {
  let value = input.normalize('NFKC').replace(CONTROL_CHARS, '').replace(BIDI_CONTROLS, '').replace(ZERO_WIDTH, '')
  if (!multiline) value = value.replace(/[\r\n\t]+/g, ' ')
  return value.replace(/[  ]{2,}/g, ' ').trim()
}

export function normalizeEmail(input: string): string {
  return sanitizeText(input).toLowerCase()
}

/** Escapes text for inclusion in an HTML email body. Only used for server-built emails. */
export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
