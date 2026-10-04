import { defineConfig } from '@playwright/test'

const PORT = 3100
const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`

/**
 * End-to-end and accessibility tests against a production build:
 *
 *   npm run build
 *   npm run test:e2e
 *
 * Playwright starts `next start` on port 3100 with the local auth stub enabled (or reuses a server
 * already listening there). Signed-in tests use the stub (src/lib/auth/e2e-stub.ts), which the
 * server refuses outside DEPLOY_ENV=local. Global setup seeds its own accounts in DATABASE_URL.
 * Set E2E_BASE_URL to test a server you started yourself.
 */
export default defineConfig({
  testDir: './specs',
  globalSetup: './seed.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never', outputFolder: '../playwright-report' }]] : [['list']],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {},
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `npx next start -p ${PORT}`,
        cwd: '..',
        url: `${BASE_URL}/api/health`,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        env: { E2E_AUTH_STUB: 'true', DEPLOY_ENV: 'local', APP_URL: BASE_URL },
      },
})
