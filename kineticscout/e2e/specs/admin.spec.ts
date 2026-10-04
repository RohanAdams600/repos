import { expect, test } from '@playwright/test'
import { expectAccessible, signIn, state, watchProblems } from '../helpers'

test('the admin console is accessible and hidden from others', async ({ page, context, baseURL }) => {
  await signIn(context, state().admin.cookie, baseURL!)
  const problems = watchProblems(page)
  await page.goto('/admin')
  await expect(page.getByRole('heading', { name: 'Coach verification' })).toBeVisible()
  await expectAccessible(page, '/admin')
  await expect(page.getByRole('heading', { name: 'Team verification' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'National norms' })).toBeVisible()
  await expect(page.getByText('E2E Fixture Norms (not real data): End-to-end fixture table, 2026')).toBeVisible()
  await page.getByRole('button', { name: 'Show open reports' }).click()
  await expect(page.getByText('No open reports')).toBeVisible()
  await expectAccessible(page, '/admin with message reports')
  expect(problems).toEqual([])

  await context.clearCookies()
  await signIn(context, state().athlete.cookie, baseURL!)
  const response = await page.goto('/admin')
  expect(response?.status()).toBe(404)
})
