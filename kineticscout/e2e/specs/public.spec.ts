import { expect, test } from '@playwright/test'
import { expectAccessible, signIn, state, watchProblems } from '../helpers'

const PAGES = ['/', '/pricing', '/faq', '/about', '/contact', '/reviews', '/case-studies', '/blog', '/search', '/legal/privacy', '/legal/terms', '/legal/refunds', '/legal/cookies', '/legal/your-data', '/tools/percentile-calculator', '/sign-in', '/sign-up', '/forgot-password', '/consent/guardian/manage']

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
