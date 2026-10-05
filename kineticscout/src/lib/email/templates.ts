import { escapeHtml } from '@/lib/security/sanitize'

export type EmailContent = {
  paragraphs: string[]
  action?: { label: string; url: string }
  /** Small print under a divider (unsubscribe text, postal address). */
  footer?: string[]
  /** Language of the content, for screen readers in mail apps. */
  lang?: string
}

/**
 * Plain, accessible email: a text part and a minimal HTML part built from the same content.
 * Everything interpolated into HTML is escaped; links are written by the server, never user input.
 */
export function renderEmail({ paragraphs, action, footer = [], lang = 'en' }: EmailContent): { text: string; html: string } {
  const text = [...paragraphs, ...(action ? [`${action.label}: ${action.url}`] : []), ...(footer.length ? ['---', ...footer] : [])].join('\n\n')
  const p = (line: string) => `<p style="margin:0 0 16px;font:16px/1.5 Helvetica,Arial,sans-serif;color:#121212">${escapeHtml(line)}</p>`
  const html = [
    `<div lang="${escapeHtml(lang)}" style="max-width:560px">`,
    ...paragraphs.map(p),
    action
      ? `<p style="margin:24px 0"><a href="${escapeHtml(action.url)}" style="display:inline-block;padding:12px 20px;background:#E6FF00;color:#121212;border:2px solid #121212;font:bold 16px Helvetica,Arial,sans-serif;text-decoration:none">${escapeHtml(action.label)}</a></p>`
      : '',
    ...(footer.length
      ? ['<hr style="border:0;border-top:1px solid #d9d9d9;margin:24px 0">', ...footer.map((line) => `<p style="margin:0 0 8px;font:13px/1.5 Helvetica,Arial,sans-serif;color:#2d2d2d">${escapeHtml(line)}</p>`)]
      : []),
    '</div>',
  ].join('\n')
  return { text, html }
}
