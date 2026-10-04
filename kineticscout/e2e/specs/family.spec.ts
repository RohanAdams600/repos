import { expect, test } from '@playwright/test'
import { expectAccessible, signIn, state, watchProblems } from '../helpers'

test.describe('parent or guardian account', () => {
  test.beforeEach(async ({ context, baseURL }) => {
    await signIn(context, state().parent.cookie, baseURL!)
  })

  for (const scheme of ['light', 'dark'] as const) {
    test(`family pages are accessible (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme })
      const problems = watchProblems(page)
      const { jamieId, samId } = state().parent
      await page.goto('/dashboard')
      await expect(page).toHaveURL(/\/dashboard\/family$/)
      await expect(page.getByRole('heading', { level: 1, name: 'Family' })).toBeVisible()
      await expect(page.getByRole('link', { name: 'Jamie Juniorcase' })).toBeVisible()
      await expectAccessible(page, '/dashboard/family')
      for (const path of [`/dashboard/family/${jamieId}`, `/dashboard/family/${jamieId}/messages/${state().guardian.threadId}`, `/dashboard/family/${samId}`, '/events/submit', '/dashboard/notifications', '/dashboard/settings']) {
        const response = await page.goto(path)
        expect(response?.status(), path).toBe(200)
        await expect(page.locator('h1').first()).toBeVisible()
        await expectAccessible(page, path)
      }
      expect(problems).toEqual([])
    })
  }

  test('sees what is waiting and reads the copied conversation', async ({ page }) => {
    const { jamieId } = state().parent
    await page.goto(`/dashboard/family/${jamieId}`)
    await expect(page.getByRole('heading', { name: 'Join E2E High School Varsity Baseball' })).toBeVisible()
    await page.getByRole('link', { name: /Coach Morgan Recruiter/ }).click()
    await expect(page.getByText('Could we set up a call with you and a parent next week?')).toBeVisible()
    // Another athlete's id gives nothing away.
    const response = await page.goto(`/dashboard/family/${state().athlete.id}`)
    expect(response?.status()).toBe(404)
  })

  test('gives consent for a second child from the account', async ({ page }) => {
    await page.goto(`/dashboard/family/${state().parent.samId}`)
    await expect(page.getByRole('heading', { name: 'What we collect' })).toBeVisible()
    // The browser will not submit without the confirmation box and moves focus to it.
    const attest = page.getByLabel(/I am Sam's parent or legal guardian/)
    await page.getByRole('button', { name: 'Give consent' }).click()
    await expect(attest).toBeFocused()
    await expect(page).toHaveURL(new RegExp(`/dashboard/family/${state().parent.samId}$`))
    await attest.check()
    await page.getByRole('button', { name: 'Give consent' }).click()
    await expect(page.getByText("Consent recorded for Sam's account.")).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Requests waiting for you' })).toBeVisible()
    await expectAccessible(page, 'family after consent')
  })

  test('submits an event for staff review', async ({ page }) => {
    await page.goto('/events/submit')
    await page.getByLabel(/^Event name/).fill('E2E Parent Submitted Clinic')
    await page.getByLabel(/^Type/).selectOption('CAMP')
    await page.getByLabel(/^Sport/).selectOption('BASEBALL')
    await page.getByLabel(/^Organizer \(/).fill('E2E Fixture Events (test data)')
    await page.getByLabel(/^Organizer.s page/).fill('https://e2e.example.test/clinic')
    const start = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10)
    await page.getByLabel(/^Start date/).fill(start)
    await page.getByLabel(/^End date/).fill(start)
    await page.getByLabel(/^City/).fill('Austin')
    await page.getByLabel(/^State/).selectOption('TX')
    await page.getByLabel(/^Description/).fill('Fixture clinic submitted by the automated tests. Not a real event.')
    await page.getByRole('button', { name: 'Submit for review' }).click()
    await expect(page.getByText('Waiting for staff review. Only you and our staff can see this page.')).toBeVisible()
    await expectAccessible(page, 'submitted event')
  })
})
