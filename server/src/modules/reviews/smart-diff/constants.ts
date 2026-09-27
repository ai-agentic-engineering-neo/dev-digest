import type { SmartDiffRole } from '@devdigest/shared';

/** Display order of Smart Diff groups. */
export const SMART_DIFF_ROLE_ORDER: readonly SmartDiffRole[] = [
  'core',
  'tests',
  'wiring',
  'docs',
  'boilerplate',
];

/**
 * Classification order: FIRST MATCH WINS, `core` is the fallback. Boilerplate
 * goes first so `__tests__/__snapshots__/x.snap` is boilerplate, not a test;
 * wiring precedes docs so `.claude/skills/x/SKILL.md` is wiring; tests precede
 * docs so `e2e/README.md` is a test.
 */
export const CLASSIFY_ORDER: readonly Exclude<SmartDiffRole, 'core'>[] = [
  'boilerplate',
  'tests',
  'wiring',
  'docs',
];

// ---- Matcher lists (paths are repo-relative, '/'-separated) ----
export const LOCKFILE_BASENAMES = ['pnpm-lock.yaml', 'package-lock.json', 'yarn.lock'];
export const BOILERPLATE_ROOT_DIRS = ['dist', 'build'];
export const BOILERPLATE_ANY_SEGMENTS = ['__snapshots__'];

export const TEST_BASENAME_RE = /\.(test|spec)\.[jt]sx?$/;
export const TEST_ANY_SEGMENTS = ['test', 'tests', '__tests__'];
export const TEST_ROOT_DIRS = ['e2e'];

export const WIRING_BASENAMES = ['index.ts', 'index.js'];
export const WIRING_BASENAME_RES = [
  /^tsconfig.*\.json$/,
  /^\.eslintrc/,
  /^\.env/,
  /^docker-compose.*\.ya?ml$/,
];
export const WIRING_ROOT_DIRS = ['.github', '.claude'];

export const DOCS_EXTENSIONS = ['.md', '.mdx'];
export const DOCS_ROOT_DIRS = ['docs'];
export const DOCS_BASENAME_PREFIXES = ['README', 'CHANGELOG', 'LICENSE'];
