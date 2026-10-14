import { defineConfig } from 'vitest/config'

/** Runs the weekly standouts report (scripts/*.report.ts), separate from the test suite. */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['scripts/**/*.report.ts'],
  },
})
