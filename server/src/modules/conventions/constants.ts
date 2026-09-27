/**
 * Conventions module constants — what the sampler is allowed to read, what the
 * verifier is willing to believe, and the names the generated skill defaults to.
 *
 * The limits are deliberately small. A conventions scan is one cheap model call
 * over a reading list a human could skim; anything larger buys noise, not
 * accuracy, and pushes the job past the JobRunner's 120s timeout.
 */

/** JobRunner kind for a scan. Registered in `routes.ts` at module load. */
export const EXTRACT_JOB_KIND = 'conventions-extract';

/** How many rank-ordered source files the model sees. */
export const SAMPLE_FILE_COUNT = 12;

/**
 * How many candidates the sampler reads to pick those twelve from. The extra
 * room is what lets it skip a barrel or a 10-line helper — the first real scan
 * spent two of its twelve slots on files of 9 and 10 lines — without losing
 * the per-package balance the facade's interleave produced.
 */
export const SAMPLE_POOL_SIZE = 36;

/** A file shorter than this carries too little style to be worth a sample slot. */
export const MIN_SAMPLE_LINES = 20;

/** A sampled file is truncated to this many lines (the head is what declares style). */
export const MAX_SAMPLE_LINES = 250;

/**
 * Token ceiling for the raw sample text (configs + code), counted with the real
 * tokenizer. Files at the end of the reading list are dropped first.
 *
 * Measured, not guessed: the first real scan (20 files of this monorepo) read
 * 2.2k tokens of configs and 7.3k of code, 13.2k tokens in total with the
 * prompt and line numbers, and took 68s — of which almost all was spent
 * GENERATING 9.1k output tokens. So the budget is not what bounds latency; it
 * bounds a pathological sample (twelve dense 250-line files would be ~36k) and
 * keeps a cheap model's prompt short enough to hold. 24k is ~2.5× the observed
 * sample: a typical repo is never cut, an outlier is.
 */
export const SAMPLE_TOKEN_BUDGET = 24_000;

/** Directories scanned for config files: the clone root plus first-level packages. */
export const MAX_CONFIG_DIRS = 6;

/** Hard cap on config files fed to the model, across all directories. */
export const MAX_CONFIG_FILES = 12;

/** A config file is truncated to this many bytes (lockfile-sized ones are useless). */
export const MAX_CONFIG_BYTES = 8 * 1024;

/**
 * Config file names, matched case-insensitively. Prefix entries end in `*`:
 * `tsconfig*` catches `tsconfig.build.json`, `.eslintrc*` the five legacy forms.
 */
export const CONFIG_FILE_PATTERNS = [
  'package.json',
  'tsconfig*',
  '.eslintrc*',
  'eslint.config.*',
  '.prettierrc*',
  'prettier.config.*',
  'biome.json',
  '.editorconfig',
] as const;

/** Files that mark a first-level directory as a package worth sampling configs from. */
export const PACKAGE_MARKER = 'package.json';

/** Longest evidence span the verifier accepts; more than this is not a citation. */
export const MAX_EVIDENCE_SPAN = 40;

/** Lines of slack around the claimed range when matching a snippet. */
export const EVIDENCE_SEARCH_PADDING = 2;

/** Snippet lines carried into the generated skill body, per rule. */
export const MAX_SNIPPET_LINES_IN_SKILL = 8;

/** Default name of the skill built from accepted candidates. */
export const DEFAULT_SKILL_NAME = 'repo-conventions';

/** Guard on the model's answer — a scan proposing more than this is misbehaving. */
export const MAX_CANDIDATES = 40;

/**
 * A scan still `running` after this long is dead: the process restarted, or
 * the model call hung. Worst case for a live one is ~5 minutes (the OpenRouter
 * SDK's 90s timeout, retried twice, plus sampling). Left alone, a dead scan
 * would hold the one-running-scan index forever and the repo could never be
 * scanned again.
 */
export const STALE_SCAN_MS = 10 * 60_000;

/**
 * Per-request model timeout. Just under the JobRunner's 120s job timeout, so a
 * slow call is recorded by the handler as a failed scan instead of the job
 * being abandoned while the call carries on. Honoured by the OpenAI and
 * Anthropic adapters; the OpenRouter client applies its own 90s.
 */
export const MODEL_TIMEOUT_MS = 110_000;

/**
 * Longest quote a citation may carry. The prompt asks for 1–8 lines and states
 * this number as the hard limit; the two must agree, or the model is told one
 * rule and judged by another. (One real candidate that survived quoted 14.)
 */
export const MAX_SNIPPET_LINES = 20;

/**
 * Shortest normalised quote the verifier will look for ANYWHERE in a file.
 * Inside the claimed range a short quote is fine; across the whole file, `});`
 * or `return x` would match somewhere in almost every file, and a match found
 * by accident is not evidence.
 */
export const MIN_RELOCATE_CHARS = 10;
