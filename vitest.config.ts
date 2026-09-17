import path from 'path'
import { fileURLToPath } from 'url'

import { defineConfig } from 'vitest/config'

const dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(dirname, 'src'),
      // `server-only` throws outside a React Server Component build; tests run plain Node.
      'server-only': path.resolve(dirname, 'src/test/server-only-stub.ts'),
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
    passWithNoTests: true,
  },
})
