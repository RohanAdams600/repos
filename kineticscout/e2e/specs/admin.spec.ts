import { expect, test } from '@playwright/test'
import { expectAccessible, signIn, state, watchProblems } from '../helpers'

test('the admin console is accessible and hidden from others', async ({ page, context, baseURL }) => {
  await signIn(context, state().admin.cookie, baseURL!)
  const problems = watchProblems(page)
  await page.goto('/admin')
  await expect(page.getByRole('heading', { name: 'Coach verification' })).toBeVisible()
  await expectAccessible(page, '/admin')
  expect(problems).toEqual([])

  await context.clearCookies()
  await signIn(context, state().athlete.cookie, baseURL!)
  const response = await page.goto('/admin')
  expect(response?.status()).toBe(404)
})
