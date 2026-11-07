import type { SmartDiffRole } from '@devdigest/shared';

export interface SmartDiffRule {
  role: SmartDiffRole;
  patterns: readonly string[];
}

/** Evaluation order matters: the first rule with a matching pattern wins. */
export const SMART_DIFF_RULES = [
  {
    role: 'boilerplate',
    patterns: [
      '**/*.lock',
      '**/pnpm-lock.yaml',
      '**/package-lock.json',
      '**/yarn.lock',
      '**/dist/**',
      '**/build/**',
      '**/__snapshots__/**',
      '**/*.snap',
      '**/*.generated.*',
      '**/*.min.js',
    ],
  },
  {
    role: 'tests',
    patterns: [
      '**/*.test.ts',
      '**/*.test.tsx',
      '**/*.it.test.ts',
      '**/*.spec.ts',
      '**/test/**',
      '**/tests/**',
      '**/__tests__/**',
      'e2e/**',
    ],
  },
  {
    role: 'wiring',
    patterns: [
      '**/index.ts',
      '**/index.js',
      '**/*.config.*',
      '**/tsconfig*.json',
      '**/.eslintrc*',
      '**/.env*',
      '**/docker-compose*.yml',
      '.github/**',
      '.claude/**',
    ],
  },
  {
    role: 'docs',
    patterns: ['**/*.md', 'docs/**', '**/README*', '**/CHANGELOG*', '**/LICENSE'],
  },
] as const satisfies readonly SmartDiffRule[];

export const SMART_DIFF_FALLBACK_ROLE: SmartDiffRole = 'core';

/** Order of groups in the response. */
export const SMART_DIFF_GROUP_ORDER: readonly SmartDiffRole[] = [
  'core',
  'tests',
  'wiring',
  'docs',
  'boilerplate',
];

/** A PR with more changed lines (additions + deletions) than this is flagged `too_big`. */
export const SMART_DIFF_LARGE_PR_LINES = 1000;
