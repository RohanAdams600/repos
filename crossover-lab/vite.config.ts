import { defineConfig } from 'vitest/config'

export default defineConfig({
  // Relative asset paths so the build works from any static host or sub-folder.
  base: './',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 900,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
