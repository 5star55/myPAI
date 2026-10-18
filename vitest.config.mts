import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { alias: { '@shared': resolve('src/shared') } },
  test: {
    environment: 'node',
    setupFiles: ['tests/setup.ts'],
    // Each file gets fresh modules (and so fresh stores and temp folders).
    isolate: true,
    pool: 'forks'
  }
})
