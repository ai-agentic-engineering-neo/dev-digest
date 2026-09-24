import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      // Single-sourced contracts live in the server's vendored shared (the
      // engine borrows them; see tsconfig paths).
      '@devdigest/shared': path.resolve(__dirname, '../server/src/vendor/shared'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts', 'src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      reporter: ['text', 'text-summary'],
      // Just below the measured baseline (2026-09-22: 95.09 / 85.38 / 96.29 / 95.09)
      // so a PR that drops coverage fails `npm run test:coverage`.
      thresholds: { statements: 94, branches: 84, functions: 95, lines: 94 },
    },
  },
});
