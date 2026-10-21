/**
 * smart-diff: the single classifier table (ring 2, pure).
 * Patterns are matched against the POSIX path, lower-cased. First matching role
 * wins; precedence is boilerplate → tests → docs → wiring, default core.
 * All patterns are anchored and free of nested quantifiers (linear time).
 */
import type { SmartDiffRole } from '@devdigest/shared';

/** Display order of the groups (also the order the API returns them in). */
export const ROLE_ORDER: readonly SmartDiffRole[] = ['core', 'tests', 'wiring', 'docs', 'boilerplate'];

export const DEFAULT_ROLE: SmartDiffRole = 'core';

export interface RoleRule {
  role: SmartDiffRole;
  patterns: RegExp[];
}

export const ROLE_RULES: readonly RoleRule[] = [
  {
    role: 'boilerplate',
    patterns: [
      /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|go\.sum|cargo\.lock)$/,
      /\.lock$/,
      /\.min\.(js|css)$/,
      /\.generated\./,
      /\.snap$/,
      /\.map$/,
      /(^|\/)(dist|build)\//,
      /(^|\/)db\/migrations\/meta\//,
    ],
  },
  {
    role: 'tests',
    patterns: [
      /(^|\/)__(tests|fixtures|mocks)__\//,
      /\.(test|spec)\.[^/]+$/,
      /(^|\/)(test|tests|e2e)\//,
      /\.flow\.json$/,
    ],
  },
  {
    role: 'docs',
    patterns: [
      /\.(md|mdx|rst)$/,
      /(^|\/)docs?\/.*\.txt$/,
      /(^|\/)docs?\//,
      /(^|\/)license[^/]*$/,
      /(^|\/)changelog[^/]*$/,
    ],
  },
  {
    role: 'wiring',
    patterns: [
      /(^|\/)package\.json$/,
      /(^|\/)tsconfig[^/]*\.json$/,
      /\.config\.(js|cjs|mjs|ts)$/,
      /(^|\/)\.eslintrc[^/]*$/,
      /(^|\/)dockerfile$/,
      /(^|\/)docker-compose[^/]*\.yml$/,
      /(^|\/)\.github\//,
      /(^|\/)\.env\.example$/,
      /(^|\/)index\.(ts|tsx|js)$/,
      /(^|\/)(server|app|main|config|routes|container)\.(ts|js)$/,
      /^[^/]+\.(json|ya?ml|toml)$/,
    ],
  },
];

/** Same threshold as the PR-list "L" size bucket. */
export const SPLIT_THRESHOLD_LINES = 400;
