/**
 * Path/pattern constants for the Smart Diff classifier (`smart-diff.ts`).
 * Pure data — tune thresholds and patterns here without touching the
 * classification logic itself. Checked most-specific-first: boilerplate,
 * then wiring, else core (the default).
 */

export const LOCK_FILE_PATTERNS: RegExp[] = [
  /(^|\/)package-lock\.json$/,
  /(^|\/)pnpm-lock\.ya?ml$/,
  /(^|\/)yarn\.lock$/,
  /(^|\/)Cargo\.lock$/,
  /(^|\/)poetry\.lock$/,
  /(^|\/)Gemfile\.lock$/,
  /(^|\/)composer\.lock$/,
  /(^|\/)go\.sum$/,
];

export const BOILERPLATE_PATH_PATTERNS: RegExp[] = [
  ...LOCK_FILE_PATTERNS,
  /(^|\/)package\.json$/,
  /(^|\/)(dist|build|out|coverage|\.next)\//,
  /(^|\/)__snapshots__\//,
  /\.snap$/,
  /\.min\.(js|css)$/,
  /\.map$/,
];

export const WIRING_BASENAME_PATTERNS: RegExp[] = [
  /^index\.[cm]?[jt]sx?$/,
  /^server\.[cm]?[jt]s$/,
  /^config\.[cm]?[jt]s$/,
  /^container\.[cm]?[jt]s$/,
  /^app\.[cm]?[jt]s$/,
  /^bootstrap\.[cm]?[jt]s$/,
  /^main\.[cm]?[jt]s$/,
  /^setup\.[cm]?[jt]s$/,
];

export const WIRING_PATH_PATTERNS: RegExp[] = [
  /\.config\.[cm]?[jt]s$/,
  /(^|\/)tsconfig.*\.json$/,
  /(^|\/)\.github\/workflows\//,
  /(^|\/)docker-compose.*\.ya?ml$/,
  /(^|\/)Dockerfile/,
  /(^|\/)\.env(\.|$)/,
];

/** Above this many total changed lines (additions+deletions across all
 *  files), the PR is flagged as a split candidate. */
export const SPLIT_SUGGESTION_LINE_THRESHOLD = 400;
