import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    coverage: {
      provider: 'v8',
      include: ['lib/game/**/*.ts'],
      exclude: ['lib/game/gameEngine.ts'], // has DB import, covered via integration
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, '.'),
    },
  },
})
