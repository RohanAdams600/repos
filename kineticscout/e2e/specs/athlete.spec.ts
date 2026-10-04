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
      for (const path of ['/dashboard', '/dashboard/profile', '/dashboard/metrics', '/dashboard/insights', '/dashboard/analysis', '/dashboard/matchmaker', '/dashboard/recruiting', '/dashboard/contact-requests', '/dashboard/teams', '/dashboard/messages', `/dashboard/messages/${state().recruiter.threadId}`, '/dashboard/notifications', '/dashboard/billing', '/dashboard/settings']) {
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
    await page.getByRole('listitem').filter({ hasText: 'Casey Coachman' }).getByRole('button', { name: 'Block coach' }).click()
    const dialog = page.getByRole('dialog', { name: 'Block Casey Coachman?' })
    await expect(dialog.getByText(/removed from their KineticScout page/)).toBeVisible()
    await expectAccessible(page, 'block coach dialog')
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
  })

  test('accepts a result their team coach recorded', async ({ page }) => {
    await page.goto('/dashboard/teams')
    await expect(page.getByText('Pat Teamcoach, E2E High School Varsity Baseball.')).toBeVisible()
    await page.getByRole('button', { name: 'Accept exit velocity' }).click()
    await expect(page.getByText('Added to your measurements as coach-recorded.')).toBeVisible()
    await page.goto('/dashboard/metrics')
    await expect(page.getByText('Coach-recorded').first()).toBeVisible()
    await expectAccessible(page, 'measurements with a coach-recorded value')
  })

  test('sees a national standing from the active norm table', async ({ page }) => {
    await page.goto('/dashboard/insights')
    await expect(page.getByText(/National:/).first()).toBeVisible()
    await expect(page.getByText(/E2E Fixture Norms \(not real data\) sample/).first()).toBeVisible()
  })

  test('replies to a college coach in a conversation', async ({ page }) => {
    await page.goto('/dashboard/messages')
    await page.getByRole('link', { name: /Coach Morgan Recruiter/ }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Coach Morgan Recruiter' })).toBeVisible()
    await expect(page.getByText('When is a good time for a call this week?')).toBeVisible()
    await page.getByRole('textbox', { name: /^Message/ }).fill('Thursday after practice works for me.')
    await page.getByRole('button', { name: 'Send' }).click()
    await expect(page.getByText('Thursday after practice works for me.')).toBeVisible()
    await expectAccessible(page, 'conversation after a reply')
  })
})
