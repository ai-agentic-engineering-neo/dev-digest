import type { SmartDiffRole } from '@devdigest/shared';

/**
 * Fixed group order the route always returns in, and the order the client
 * renders (server/specs/06-smart-diff.md, "Classification").
 */
export const SMART_DIFF_ROLE_ORDER: readonly SmartDiffRole[] = ['core', 'tests', 'wiring', 'docs', 'boilerplate'];

/**
 * classifyFile checks roles in this order — the first pattern match wins.
 * 'core' is never checked here; it is the default when nothing else matches.
 */
export const ROLE_CHECK_ORDER: readonly Exclude<SmartDiffRole, 'core'>[] = ['boilerplate', 'tests', 'wiring', 'docs'];

/**
 * Glob patterns per role (server/specs/06-smart-diff.md, "Classification").
 * Gitignore-like semantics, resolved in classify.ts:
 *   - no slash at all → matches the basename, at any depth
 *   - a slash, not a leading "star-star-slash" → anchored at the repo root
 *   - a leading "star-star-slash" → matches at any depth regardless of the
 *     rest of the pattern (never written literally in this comment — it
 *     would close a block comment early)
 * The first pattern to match wins; ROLE_CHECK_ORDER decides which role is
 * tried first, which matters more than any single pattern (three contested
 * cases are pinned in test/smart-diff-classify.test.ts).
 */
export const ROLE_PATTERNS: Readonly<Record<Exclude<SmartDiffRole, 'core'>, readonly string[]>> = {
  boilerplate: [
    '*.lock',
    'pnpm-lock.yaml',
    'package-lock.json',
    'yarn.lock',
    'dist/**',
    'build/**',
    '**/__snapshots__/**',
    '*.snap',
    '*.generated.*',
    '*.min.js',
  ],
  tests: [
    '**/*.test.ts',
    '**/*.test.tsx',
    '**/*.it.test.ts',
    '**/*.spec.ts',
    '**/test/**',
    '**/tests/**',
    '**/__tests__/**',
    'e2e/**',
  ],
  wiring: [
    'index.ts',
    'index.js',
    '*.config.*',
    'tsconfig*.json',
    '.eslintrc*',
    '.env*',
    'docker-compose*.yml',
    '.github/**',
    '.claude/**',
  ],
  docs: ['*.md', 'docs/**', 'README*', 'CHANGELOG*', 'LICENSE'],
};
