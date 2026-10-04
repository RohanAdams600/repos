import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const alias = {
  '@': fileURLToPath(new URL('./src', import.meta.url)),
  '@worker': fileURLToPath(new URL('./worker', import.meta.url)),
  // `server-only` throws outside the Next.js bundler; tests run in plain Node.
  'server-only': fileURLToPath(new URL('./tests/stubs/server-only.ts', import.meta.url)),
}

export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.{ts,tsx}'],
          environment: 'node',
          setupFiles: ['tests/setup/unit-env.ts'],
        },
      },
      {
        resolve: { alias },
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts'],
          environment: 'node',
          setupFiles: ['tests/setup/integration-env.ts'],
          globalSetup: ['tests/setup/integration-global.ts'],
          // Integration tests share one database; run files serially.
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
})
