import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Raw HTML injection is banned outright. Markdown is rendered through react-markdown without rehype-raw.
      'react/no-danger': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'lucide-react', message: 'Brand rule: use the custom icon set in src/components/icons.tsx.' },
          ],
        },
      ],
    },
  },
  globalIgnores(['.next/**', 'out/**', 'build/**', 'next-env.d.ts', 'src/generated/**', 'coverage/**']),
])
