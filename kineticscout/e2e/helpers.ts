import AxeBuilder from '@axe-core/playwright'
import { expect, type BrowserContext, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { E2EState } from './seed'

const HERE = path.dirname(fileURLToPath(import.meta.url))

export function state(): E2EState {
  return JSON.parse(readFileSync(path.join(HERE, '.state.json'), 'utf8')) as E2EState
}

/** Signs a context in through the local stub and pre-answers the cookie banner so it does not cover the page. */
export async function signIn(context: BrowserContext, cookie: string | null, baseURL: string): Promise<void> {
  const url = new URL(baseURL)
  const cookies = [{ name: 'ks_consent', value: `v1.denied.${Math.floor(Date.now() / 1000)}`, domain: url.hostname, path: '/' }]
  if (cookie) cookies.push({ name: 'ks_e2e_session', value: cookie, domain: url.hostname, path: '/' })
  await context.addCookies(cookies)
}

/** WCAG 2.2 A and AA, plus the AAA contrast rule the brand requires. */
export async function expectAccessible(page: Page, label: string): Promise<void> {
  // withTags and withRules each replace axe's runOnly setting, so the AAA contrast rule runs as a second pass.
  // Sequential: axe refuses to start a run while another is in progress on the same page.
  const standard = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
  const aaa = await new AxeBuilder({ page }).withRules(['color-contrast-enhanced']).analyze()
  const summary = [...standard.violations, ...aaa.violations].map((v) => `${v.id} (${v.impact}): ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(', ')}`)
  expect(summary, `${label} has accessibility violations`).toEqual([])
}

/** No CSP violations, page errors or console errors while the page was open. */
export function watchProblems(page: Page): string[] {
  const problems: string[] = []
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('status of 404')) problems.push(`console: ${m.text()}`)
  })
  return problems
}
