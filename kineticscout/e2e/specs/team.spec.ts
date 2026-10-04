import { expect, test } from '@playwright/test'
import { expectAccessible, signIn, state, watchProblems } from '../helpers'

test.describe('high school team coach', () => {
  test.beforeEach(async ({ context, baseURL }) => {
    await signIn(context, state().teamCoach.cookie, baseURL!)
  })

  for (const scheme of ['light', 'dark'] as const) {
    test(`team pages are accessible (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme })
      const problems = watchProblems(page)
      const { teamId, sessionId } = state().teamCoach
      await page.goto('/dashboard')
      await expect(page).toHaveURL(/\/dashboard\/team$/)
      await expect(page.getByRole('heading', { level: 1, name: 'Your teams' })).toBeVisible()
      await expectAccessible(page, '/dashboard/team')
      for (const path of [`/dashboard/team/${teamId}/record`, `/dashboard/team/session/${sessionId}`, '/dashboard/notifications', '/dashboard/settings']) {
        const response = await page.goto(path)
        expect(response?.status(), path).toBe(200)
        await expect(page.locator('h1').first()).toBeVisible()
        await expectAccessible(page, path)
      }
      expect(problems).toEqual([])
    })
  }

  test('records a testing day for a player on the roster', async ({ page }) => {
    await page.goto(`/dashboard/team/${state().teamCoach.teamId}/record`)
    await page.getByLabel(/^Name/).fill('Spring scrimmage')
    await page.getByLabel('60-yard dash (s)').check()
    await page.getByRole('button', { name: 'Save and send to athletes' }).click()
    await expect(page.getByText('Enter at least one result')).toBeVisible()
    await page.getByRole('group', { name: 'Avery Testcase' }).getByLabel(/^60 yd/).fill('6.95')
    await page.getByRole('button', { name: 'Save and send to athletes' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Spring scrimmage' })).toBeVisible()
    await expect(page.getByText('Waiting for the athlete')).toBeVisible()
    await expectAccessible(page, 'new testing day')
  })

  test('is kept out of athlete and college coach pages', async ({ page }) => {
    await page.goto('/dashboard/teams')
    await expect(page).toHaveURL(/\/dashboard(\/team)?$/)
    await page.goto('/dashboard/messages')
    await expect(page).toHaveURL(/\/dashboard(\/team)?$/)
  })
})
