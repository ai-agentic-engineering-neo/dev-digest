/**
 * Literals for the smart-diff classifier (L03). No I/O, no framework types —
 * safe to import from `helpers.ts` and `service.ts`. The group display order
 * is `SMART_DIFF_ROLE_ORDER` in the shared contract (`contracts/brief.ts`).
 */

/**
 * A PR at or above this many changed lines (additions + deletions) is
 * flagged `too_big`. Matches the existing "L" size badge on the PR list
 * (`client/src/app/repos/[repoId]/pulls/constants.ts:36`, `SIZE_MEDIUM_MAX`).
 */
export const LARGE_PR_LINES = 400;

// ---- boilerplate -----------------------------------------------------------
export const BOILERPLATE_BASENAME_SUFFIXES = ['.lock', '.snap', '.min.js'] as const;
export const BOILERPLATE_BASENAMES = ['pnpm-lock.yaml', 'package-lock.json', 'yarn.lock'] as const;
export const BOILERPLATE_SEGMENTS = ['dist', 'build', '__snapshots__'] as const;
export const GENERATED_BASENAME_RE = /^.+\.generated\..+$/;

// ---- tests ------------------------------------------------------------------
export const TEST_BASENAME_SUFFIXES = ['.test.ts', '.test.tsx', '.spec.ts'] as const;
export const TEST_SEGMENTS = ['test', 'tests', '__tests__', 'e2e'] as const;

// ---- wiring -------------------------------------------------------------------
export const WIRING_BASENAMES = ['index.ts', 'index.js'] as const;
export const WIRING_BASENAME_PREFIXES = ['.eslintrc', '.env'] as const;
export const WIRING_SEGMENTS = ['.github', '.claude'] as const;
export const CONFIG_BASENAME_RE = /^.+\.config\..+$/;

// ---- docs -----------------------------------------------------------------
export const DOCS_BASENAME_SUFFIX = '.md';
export const DOCS_SEGMENT = 'docs';
export const DOCS_BASENAME_PREFIXES = ['README', 'CHANGELOG'] as const;
export const DOCS_BASENAMES = ['LICENSE'] as const;
