import { expect, test } from '@playwright/test'
import { expectAccessible, signIn, state, watchProblems } from '../helpers'

const PAGES = ['/', '/pricing', '/faq', '/about', '/contact', '/reviews', '/case-studies', '/blog', '/search', '/legal/privacy', '/legal/terms', '/legal/refunds', '/legal/cookies', '/legal/your-data', '/tools/percentile-calculator', '/sign-in', '/sign-up', '/forgot-password', '/consent/guardian/manage', '/offline']

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`public pages (${scheme})`, () => {
    test.use({ colorScheme: scheme })
    for (const path of PAGES) {
      test(`${path} is accessible and error free`, async ({ page, context, baseURL }) => {
        await signIn(context, null, baseURL!)
        const problems = watchProblems(page)
        const response = await page.goto(path)
        expect(response?.status()).toBe(200)
        await expect(page.locator('h1').first()).toBeVisible()
        expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)
        await expectAccessible(page, path)
        expect(problems).toEqual([])
      })
    }
  })
}

test('the public profile, its PDF and its share image work', async ({ page, context, baseURL, request }) => {
  await signIn(context, null, baseURL!)
  const { slug } = state().athlete
  await page.goto(`/p/${slug}`)
  await expect(page.getByRole('heading', { level: 1, name: 'Avery Testcase' })).toBeVisible()
  await expect(page.getByText('Verified').first()).toBeVisible()
  await expectAccessible(page, 'public profile')
  const pdf = await request.get(`/p/${slug}/pdf`, { headers: { 'user-agent': 'Mozilla/5.0 Safari' } })
  expect(pdf.headers()['content-type']).toBe('application/pdf')
  const image = await request.get(`/p/${slug}/opengraph-image`)
  expect(image.headers()['content-type']).toBe('image/png')
  expect((await request.get('/p/nobody-aaaaaaaa')).status()).toBe(404)
})

test('signed-out visitors are sent to sign in from the dashboard', async ({ page, context, baseURL }) => {
  await signIn(context, null, baseURL!)
  await page.goto('/dashboard/settings')
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fdashboard%2Fsettings/)
})

test('a guardian can review a team request and read a copied conversation through their private links', async ({ page, context, baseURL }) => {
  await signIn(context, null, baseURL!)
  const { teamToken, threadId, threadToken } = state().guardian
  await page.goto(`/consent/guardian/team?token=${encodeURIComponent(teamToken)}`)
  await expect(page.getByRole('heading', { level: 1, name: 'Jamie would like to join a team' })).toBeVisible()
  await expect(page.getByText('Pat Teamcoach, Head Coach')).toBeVisible()
  await expectAccessible(page, 'guardian team approval')

  await page.goto(`/consent/guardian/messages?thread=${threadId}&token=${encodeURIComponent(threadToken)}`)
  await expect(page.getByText('Could we set up a call with you and a parent next week?')).toBeVisible()
  await page.getByText('Report this message').click()
  await expectAccessible(page, 'guardian conversation')
  // A wrong token shows nothing.
  await page.goto(`/consent/guardian/messages?thread=${threadId}&token=wrong`)
  await expect(page.getByText('This link is not valid')).toBeVisible()
})

test('the app can be installed: manifest, icons and service worker', async ({ request }) => {
  const manifest = await request.get('/manifest.webmanifest')
  expect(manifest.ok()).toBe(true)
  const body = await manifest.json()
  expect(body).toMatchObject({ name: 'KineticScout', start_url: '/dashboard', display: 'standalone' })
  for (const icon of body.icons as { src: string }[]) expect((await request.get(icon.src)).headers()['content-type']).toBe('image/png')
  const worker = await request.get('/sw.js')
  expect(worker.headers()['cache-control']).toContain('no-cache')
  expect(worker.headers()['content-security-policy']).toBe("default-src 'self'; script-src 'self'")
})
