import { expect, test } from '@playwright/test'
import { signIn, state } from '../helpers'

/**
 * Every page fits a 360px phone screen in both languages: nothing makes the page scroll sideways.
 * Wide tables and the dashboard menu scroll inside their own boxes instead. The rest of the suite
 * runs at desktop width, so this is the only phone-width check.
 */

const PHONE = { width: 360, height: 800 }

function pages() {
  const s = state()
  return {
    signedOut: [
      '/', '/pricing', '/faq', '/about', '/contact', '/reviews', '/case-studies', '/blog', '/search', '/legal/privacy', '/legal/terms', '/legal/refunds',
      '/legal/cookies', '/legal/your-data', '/tools/percentile-calculator', '/events', `/events/${s.events.open}`, '/recruiting-calendar', '/sign-in',
      '/sign-up', '/forgot-password', '/consent/guardian/manage', '/offline', `/p/${s.athlete.slug}`,
    ],
    roles: [
      {
        name: 'athlete',
        cookie: s.athlete.cookie,
        paths: [
          '/dashboard', '/dashboard/profile', '/dashboard/metrics', '/dashboard/insights', '/dashboard/analysis', `/dashboard/analysis/${s.analysisId}`,
          '/dashboard/matchmaker', '/dashboard/recruiting', '/dashboard/contact-requests', '/dashboard/teams', '/dashboard/events', '/dashboard/training',
          '/dashboard/messages', `/dashboard/messages/${s.recruiter.threadId}`, '/dashboard/notifications', '/dashboard/billing', '/dashboard/settings', '/events/submit',
        ],
      },
      { name: 'college coach', cookie: s.coach.cookie, paths: ['/dashboard', '/dashboard/prospects', '/dashboard/saved', '/dashboard/contact-requests', '/dashboard/messages', '/dashboard/settings'] },
      { name: 'team coach', cookie: s.teamCoach.cookie, paths: ['/dashboard/team', `/dashboard/team/${s.teamCoach.teamId}/record`, `/dashboard/team/session/${s.teamCoach.sessionId}`] },
      { name: 'parent', cookie: s.parent.cookie, paths: ['/dashboard/family', `/dashboard/family/${s.parent.jamieId}`, `/dashboard/family/${s.parent.samId}`, `/dashboard/family/${s.parent.jamieId}/messages/${s.guardian.threadId}`] },
      { name: 'staff', cookie: s.admin.cookie, paths: ['/admin'] },
    ],
  }
}

test.use({ viewport: PHONE })

for (const locale of ['en', 'es'] as const) {
  test(`signed-out pages fit a phone screen (${locale})`, async ({ page, context, baseURL }) => {
    await signIn(context, null, baseURL!)
    await context.addCookies([{ name: 'ks_locale', value: locale, domain: new URL(baseURL!).hostname, path: '/' }])
    for (const path of pages().signedOut) {
      const response = await page.goto(path)
      expect(response?.status(), path).toBe(200)
      await expect(page.locator('h1').first()).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), `${path} scrolls sideways`).toBeLessThanOrEqual(0)
    }
  })

  test(`signed-in pages fit a phone screen (${locale})`, async ({ browser, baseURL }) => {
    for (const role of pages().roles) {
      const context = await browser.newContext({ viewport: PHONE })
      await signIn(context, role.cookie, baseURL!)
      await context.addCookies([{ name: 'ks_locale', value: locale, domain: new URL(baseURL!).hostname, path: '/' }])
      const page = await context.newPage()
      for (const path of role.paths) {
        const response = await page.goto(path)
        expect(response?.status(), `${role.name} ${path}`).toBe(200)
        await expect(page.locator('h1').first()).toBeVisible()
        expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), `${role.name} ${path} scrolls sideways`).toBeLessThanOrEqual(0)
      }
      await context.close()
    }
  })
}
