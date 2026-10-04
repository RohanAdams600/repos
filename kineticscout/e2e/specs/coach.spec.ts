import { expect, test } from '@playwright/test'
import { expectAccessible, signIn, state, watchProblems } from '../helpers'

test.describe('verified coach', () => {
  test.beforeEach(async ({ context, baseURL }) => {
    await signIn(context, state().coach.cookie, baseURL!)
  })

  test('coach pages are accessible', async ({ page }) => {
    const problems = watchProblems(page)
    for (const path of ['/dashboard', '/dashboard/prospects', '/dashboard/saved', '/dashboard/contact-requests', '/dashboard/notifications', '/dashboard/settings']) {
      const response = await page.goto(path)
      expect(response?.status(), path).toBe(200)
      await expect(page.locator('h1').first()).toBeVisible()
      await expectAccessible(page, path)
    }
    expect(problems).toEqual([])
  })

  test('finds a public athlete, saves them and keeps a private note', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page.getByText('Verified coach')).toBeVisible()
    await page.goto('/dashboard/prospects')
    const result = page.getByRole('listitem').filter({ hasText: 'Avery Testcase' })
    await expect(result).toBeVisible()
    await result.getByRole('button', { name: 'Save' }).click()
    await expect(result.getByRole('button', { name: 'Saved' })).toBeVisible()
    await page.goto('/dashboard/saved')
    await expect(page.getByText('Avery Testcase')).toBeVisible()
    await page.getByLabel(/Private note/).fill('Strong arm, follow up in spring.')
    await page.getByRole('button', { name: 'Save note' }).click()
    await expect(page.getByText('Saved', { exact: true })).toBeVisible()
    await expectAccessible(page, 'saved board with note')
  })

  test('the contact dialog blocks links in a first message', async ({ page }) => {
    // Riley has no contact history with this coach, so the request button is always offered.
    await page.goto('/dashboard/prospects')
    const result = page.getByRole('listitem').filter({ hasText: 'Riley Samplecase' })
    await result.getByRole('button', { name: 'Request contact' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expectAccessible(page, 'contact dialog')
    await dialog.getByRole('button', { name: 'Send request' }).click()
    await expect(dialog.getByText("Confirm that your association's recruiting rules allow contact now.")).toBeVisible()
    await dialog.getByLabel(/^Message/).fill('Hi Riley, see our camp details at https://camp.example.com before you decide anything.')
    await dialog.getByLabel(/recruiting rules/).check()
    await dialog.getByRole('button', { name: 'Send request' }).click()
    await expect(dialog.getByText(/Leave links out of the first message/)).toBeVisible()
    await expectAccessible(page, 'contact dialog with errors')
    // Nothing was sent: the request button is still offered once the dialog closes.
    await page.keyboard.press('Escape')
    await expect(result.getByRole('button', { name: 'Request contact' })).toBeVisible()
  })
})
