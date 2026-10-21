/** onboarding — constants (ring 2). */

export const GENERATE_JOB_KIND = 'onboarding.generate';

/** Per-file and total caps on file text sent to the model. */
export const MAX_FILE_CHARS = 6_000;
export const MAX_TOTAL_CHARS = 60_000;

/** A run still `running` after this long was orphaned; `generate()` fails it and starts over. */
export const STALE_RUN_MS = 10 * 60_000;

/** Top-ranked files read after the README and manifests. */
export const TOP_FILES = 12;

/** Paths of the default-branch tree listed in the prompt. */
export const MAX_TREE_PATHS = 400;

export const MAX_FIRST_TASKS = 5;

/** Longest error text stored on a failed run. */
export const MAX_ERROR_CHARS = 500;

/** Fixed English titles, stored with the tour; the client renders i18n titles by kind. */
export const SECTION_TITLES = {
  architecture: 'Architecture overview',
  critical_paths: 'Critical paths',
  run_locally: 'How to run locally',
  reading_path: 'Guided reading path',
  first_tasks: 'First tasks',
} as const;

/** Manifest basenames (lower case) read at the repo root and one folder down. */
export const MANIFEST_FILES: readonly string[] = [
  'package.json',
  'makefile',
  'docker-compose.yml',
  'docker-compose.yaml',
  'compose.yml',
  'compose.yaml',
  '.env.example',
];

/** Root README (any case, any extension). */
export const README_PATTERN = /^readme(\.[a-z0-9]+)?$/i;

/** Tree paths containing one of these segments are never listed or read. */
export const EXCLUDED_TREE_SEGMENTS: readonly string[] = ['node_modules/', '.git/', 'dist/', 'build/', '.next/'];

export const INVALID_TOUR_ERROR = 'The model returned an invalid tour';
