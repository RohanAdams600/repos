import { expect, test } from '@playwright/test'
import { expectAccessible, signIn, state, watchProblems } from '../helpers'

test.describe('athlete', () => {
  test.beforeEach(async ({ context, baseURL }) => {
    await signIn(context, state().athlete.cookie, baseURL!)
  })

  for (const scheme of ['light', 'dark'] as const) {
    test(`dashboard pages are accessible (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme })
      const problems = watchProblems(page)
      for (const path of ['/dashboard', '/dashboard/profile', '/dashboard/metrics', '/dashboard/insights', '/dashboard/analysis', '/dashboard/matchmaker', '/dashboard/recruiting', '/dashboard/contact-requests', '/dashboard/notifications', '/dashboard/billing', '/dashboard/settings']) {
        const response = await page.goto(path)
        expect(response?.status(), path).toBe(200)
        await expect(page.locator('h1').first()).toBeVisible()
        await expectAccessible(page, path)
      }
      expect(problems).toEqual([])
    })
  }

  test('logs a measurement and sees it in the measurements list', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page.getByRole('heading', { level: 1, name: /Welcome back, Avery/ })).toBeVisible()
    await page.getByRole('combobox', { name: 'Metric (required)' }).selectOption('PITCH_VELO')
    await page.getByRole('textbox', { name: /^Value/ }).fill('81.5')
    await page.getByRole('button', { name: 'Log metric' }).click()
    await expect(page.getByText('Pitch velocity of 81.5 mph saved.')).toBeVisible()
    await page.goto('/dashboard/metrics')
    await expect(page.getByText('81.5 mph').first()).toBeVisible()
  })

  test('changes sharing settings and sees the profile link', async ({ page }) => {
    await page.goto('/dashboard/profile')
    await page.getByLabel(/Show my GPA/).check()
    await page.getByRole('button', { name: 'Save sharing settings' }).click()
    await expect(page.getByText(/Your profile link is live/)).toBeVisible()
    await expect(page.getByText(`/p/${state().athlete.slug}`)).toBeVisible()
  })

  test('accepts a coach contact request', async ({ page }) => {
    await page.goto('/dashboard/contact-requests')
    await expect(page.getByText('Casey Coachman, Assistant Coach')).toBeVisible()
    await page.getByRole('button', { name: 'Accept', exact: true }).click()
    await expect(page.getByText('Accepted. The coach has your email address.')).toBeVisible()
    // Blocking stays available after accepting. Open the confirmation and back out, so the coach spec still finds Avery.
    await page.reload()
    await page.getByRole('button', { name: 'Block coach' }).click()
    const dialog = page.getByRole('dialog', { name: 'Block Casey Coachman?' })
    await expect(dialog.getByText(/removed from their KineticScout page/)).toBeVisible()
    await expectAccessible(page, 'block coach dialog')
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
  })
})
