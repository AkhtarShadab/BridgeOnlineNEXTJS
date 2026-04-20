import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['__tests__/unit/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['lib/game/**/*.ts'],
      exclude: ['lib/game/gameEngine.ts'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, '.'),
    },
  },
})
