import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: [
      // Contracts are read from the server's vendored shared (never copied).
      // Array form + regex so '@devdigest/shared' and its subpaths both match.
      {
        find: /^@devdigest\/shared$/,
        replacement: path.resolve(__dirname, '../server/src/vendor/shared/index.ts'),
      },
      {
        find: /^@devdigest\/shared\//,
        replacement: path.resolve(__dirname, '../server/src/vendor/shared') + '/',
      },
      // The shared files import 'zod' from ../server/..., which has no
      // node_modules in CI. Force every zod import to this package's copy
      // (exactly one zod instance).
      { find: /^zod$/, replacement: path.resolve(__dirname, 'node_modules/zod') },
      { find: /^zod\//, replacement: path.resolve(__dirname, 'node_modules/zod') + '/' },
    ],
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts', 'src/**/*.test.ts'],
  },
});
