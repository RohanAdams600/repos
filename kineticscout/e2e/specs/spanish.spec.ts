import { expect, test, type BrowserContext } from '@playwright/test'
import { expectAccessible, signIn, state, watchProblems } from '../helpers'

/** Chooses Spanish the way the language switch does: the ks_locale cookie. */
async function chooseSpanish(context: BrowserContext, baseURL: string) {
  await context.addCookies([{ name: 'ks_locale', value: 'es', domain: new URL(baseURL).hostname, path: '/' }])
}

const PUBLIC = ['/', '/pricing', '/faq', '/about', '/contact', '/blog', '/search', '/legal/privacy', '/legal/terms', '/legal/refunds', '/legal/cookies', '/legal/your-data', '/tools/percentile-calculator', '/events', '/recruiting-calendar', '/sign-in', '/sign-up', '/forgot-password', '/consent/guardian/manage']

/** English phrases that must not appear on a Spanish page (chrome and common labels). */
const ENGLISH = [/\bSign in\b/, /\bDashboard\b/, /\bSettings\b/, /Privacy Policy/, /\(required\)/]

test.describe('Spanish', () => {
  for (const scheme of ['light', 'dark'] as const) {
    test(`public pages are in Spanish and accessible (${scheme})`, async ({ page, context, baseURL }) => {
      await signIn(context, null, baseURL!)
      await chooseSpanish(context, baseURL!)
      await page.emulateMedia({ colorScheme: scheme })
      const problems = watchProblems(page)
      for (const path of PUBLIC) {
        const response = await page.goto(path)
        expect(response?.status(), path).toBe(200)
        await expect(page.locator('html')).toHaveAttribute('lang', 'es')
        await expect(page.locator('h1').first()).toBeVisible()
        const main = await page.locator('main').innerText()
        for (const phrase of ENGLISH) expect(main, `${path} shows ${phrase}`).not.toMatch(phrase)
        // Spanish runs longer than English; nothing may overflow at phone width or desktop.
        expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), path).toBeLessThanOrEqual(0)
        await expectAccessible(page, `${path} (es)`)
      }
      expect(problems).toEqual([])
    })
  }

  test('the legal pages say the English text governs', async ({ page, context, baseURL }) => {
    await signIn(context, null, baseURL!)
    await chooseSpanish(context, baseURL!)
    await page.goto('/legal/privacy')
    await expect(page.getByRole('heading', { level: 1, name: 'Política de privacidad' })).toBeVisible()
    await expect(page.getByText(/El texto en inglés es el que rige/)).toBeVisible()
    await page.goto('/legal/cookies')
    await expect(page.getByRole('cell', { name: 'ks_locale' })).toBeVisible()
  })

  test('the language switch changes the page and keeps the address', async ({ page, context, baseURL }) => {
    await signIn(context, null, baseURL!)
    await page.goto('/pricing?from=test')
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
    await page.getByRole('button', { name: 'Español' }).first().click()
    await expect(page).toHaveURL(/\/pricing\?from=test$/)
    await expect(page.locator('html')).toHaveAttribute('lang', 'es')
    await page.getByRole('button', { name: 'English' }).first().click()
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  })

  test('a Spanish emailed link opens a guardian page in Spanish without a cookie', async ({ page, context, baseURL }) => {
    await signIn(context, null, baseURL!)
    const { teamToken } = state().guardian
    await page.goto(`/consent/guardian/team?token=${encodeURIComponent(teamToken)}&lang=es`)
    await expect(page.locator('html')).toHaveAttribute('lang', 'es')
    await expect(page.getByRole('heading', { level: 1, name: /quiere unirse a un equipo/ })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Aprobar' })).toBeVisible()
    await expectAccessible(page, 'guardian team link (es)')
  })

  test('athlete dashboard is in Spanish and accessible', async ({ page, context, baseURL }) => {
    await signIn(context, state().athlete.cookie, baseURL!)
    await chooseSpanish(context, baseURL!)
    const problems = watchProblems(page)
    for (const path of ['/dashboard', '/dashboard/profile', '/dashboard/metrics', '/dashboard/insights', '/dashboard/analysis', '/dashboard/matchmaker', '/dashboard/recruiting', '/dashboard/contact-requests', '/dashboard/teams', '/dashboard/events', '/dashboard/training', '/dashboard/messages', `/dashboard/messages/${state().recruiter.threadId}`, '/dashboard/notifications', '/dashboard/billing', '/dashboard/settings']) {
      const response = await page.goto(path)
      expect(response?.status(), path).toBe(200)
      await expect(page.locator('html')).toHaveAttribute('lang', 'es')
      await expect(page.getByRole('navigation', { name: 'Panel' })).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), path).toBeLessThanOrEqual(0)
      await expectAccessible(page, `${path} (es)`)
    }
    expect(problems).toEqual([])
  })

  test('the language setting saves Spanish on the account', async ({ page, context, baseURL }) => {
    await signIn(context, state().coach.cookie, baseURL!)
    await page.goto('/dashboard/settings')
    await page.getByRole('combobox', { name: 'Language' }).selectOption('es')
    await page.getByRole('button', { name: 'Save language' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Configuración' })).toBeVisible()
    // Back to English so other specs that share this account are unaffected.
    await page.getByRole('combobox', { name: 'Idioma' }).selectOption('en')
    await page.getByRole('button', { name: 'Guardar idioma' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible()
  })

  test('coach, team coach and parent pages are in Spanish and accessible', async ({ browser, baseURL }) => {
    const roles = [
      { cookie: state().coach.cookie, paths: ['/dashboard', '/dashboard/prospects', '/dashboard/saved', '/dashboard/contact-requests', '/dashboard/messages'] },
      { cookie: state().teamCoach.cookie, paths: ['/dashboard/team', `/dashboard/team/${state().teamCoach.teamId}/record`, `/dashboard/team/session/${state().teamCoach.sessionId}`] },
      { cookie: state().parent.cookie, paths: ['/dashboard/family', `/dashboard/family/${state().parent.jamieId}`, `/dashboard/family/${state().parent.samId}`, `/dashboard/family/${state().parent.jamieId}/messages/${state().guardian.threadId}`] },
    ]
    for (const role of roles) {
      const context = await browser.newContext()
      await signIn(context, role.cookie, baseURL!)
      await chooseSpanish(context, baseURL!)
      const page = await context.newPage()
      const problems = watchProblems(page)
      for (const path of role.paths) {
        const response = await page.goto(path)
        expect(response?.status(), path).toBe(200)
        await expect(page.locator('html')).toHaveAttribute('lang', 'es')
        await expect(page.locator('h1').first()).toBeVisible()
        expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), path).toBeLessThanOrEqual(0)
        await expectAccessible(page, `${path} (es)`)
      }
      expect(problems).toEqual([])
      await context.close()
    }
  })
})
