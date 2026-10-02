/**
 * onboarding constants (specs/10-onboarding-generator.md).
 *
 * Q1 (delegated by D12, DECIDED in plans/10-onboarding-generator.md) — every
 * numeric budget for this feature lives here, in one place, with the plan's
 * own rationale kept next to each value so a future change has the "why"
 * beside the number.
 */

// --- Fact payload budget (Q1) ------------------------------------------------

/**
 * Absolute token budget for the whole fact payload sent in the one structured
 * call — not a share of a model window (this codebase has no per-model
 * context-window table; `platform/price-book.ts` carries prices only, same
 * finding as `project-context/constants.ts`'s Q3). Scale anchors: the
 * repo-map prompt slot is 1500 (`repo-intel/constants.ts`), project-context
 * documents get 8000, conventions sends 12 whole source files with NO budget
 * at all. Counted with `container.tokenizer` — never a second estimator.
 */
export const ONBOARDING_FACTS_TOKEN_BUDGET = 6000;

/** Passed as `maxTokens` on the one `StructuredRequest`. Five sections + ≤10+10
 *  one-sentence reasons + one Mermaid diagram. */
export const ONBOARDING_MAX_OUTPUT_TOKENS = 4000;

// --- Section caps (AC-25, verbatim) ------------------------------------------

export const READING_PATH_MAX = 10;
export const SETUP_STEPS_MAX = 10;

/**
 * Bounds the number of critical-path CHAINS (one chain = one entry), not
 * files within a chain. Only reachable via `opts.roots` on `getCriticalPaths`
 * — the default `CRITICAL_PATH_ROOTS = 5` stays untouched for every other
 * caller (AC-11). Chain length stays `BFS_DEPTH = 2` hops (≤3 files/chain).
 */
export const CRITICAL_PATHS_MAX = 10;

export const FIRST_TASKS_MIN = 3;
export const FIRST_TASKS_MAX = 5;

// --- Fact-collection pool sizes ----------------------------------------------

/** The candidate pool named in the payload — 4× the 10 that get shown
 *  (`READING_PATH_MAX`), so the model has context for the architecture
 *  narrative and first tasks without re-ranking anything. */
export const FACT_RANKED_FILES = 40;

/** Directory skeleton bounds, derived from the indexed path set — never a
 *  fresh walk (AC-3). */
export const FACT_DIR_ENTRIES = 40;
export const FACT_DIR_DEPTH = 2;

/** From `file_facts` for the ranked pool only. */
export const FACT_ROUTES_MAX = 40;
export const FACT_CRONS_MAX = 10;

/**
 * Script strings are untrusted repo content; `MAX_SCRIPT_CHARS` mirrors
 * `MAX_SIGNATURE_CHARS = 120` (`repo-intel/constants.ts`) in spirit — long
 * enough to be a real command, short enough that a hostile script body can't
 * dominate the payload.
 */
export const FACT_SCRIPTS_MAX = 20;
export const MAX_SCRIPT_CHARS = 200;

/**
 * Ceiling on how many `file_rank` rows are pulled ONCE per generation (via
 * `RepoIntelPort.getWeightedRankedFiles`) to build the never-sent
 * `allIndexedPaths` grounding set and the directory skeleton. Mirrors
 * `repo-intel/constants.ts`'s `MAX_INDEXED_FILES` — the index itself never
 * has more ranked rows than this, so this is effectively "all of them",
 * without importing that constant across the module boundary
 * (`no-cross-module`). A judgment call: `getWeightedRankedFiles` also applies
 * the junk-path filter, so a model-cited test/config/migration file that IS
 * indexed but junk-filtered will read as "not present in the index" to
 * grounding (AC-28) — over-strict, never a security gap, and documented
 * again at the call site in `facts.ts`.
 */
export const FACT_ALL_PATHS_POOL = 5000;

// --- Checkout reads -----------------------------------------------------

/** Per-file ceiling on every checkout read, same value as project-context's
 *  `MAX_DOC_BYTES`. */
export const MAX_MANIFEST_BYTES = 256 * 1024;

/**
 * A FIXED filename list at the repo root, resolved one by one — no walk, no
 * glob — so AC-1/AC-3's "never a fresh unbounded filesystem walk" holds by
 * construction.
 */
export const CHECKOUT_READ_FILES = [
  'package.json',
  'docker-compose.yml',
  'docker-compose.yaml',
  'compose.yml',
  'compose.yaml',
  '.env.example',
  '.env.sample',
  'Makefile',
] as const;

/**
 * Package manager lockfiles — detected by filename (`stat`), NEVER read.
 * Lockfiles are megabytes and carry no fact this feature needs.
 */
export const LOCKFILE_NAMES: Readonly<Record<string, string>> = {
  'pnpm-lock.yaml': 'pnpm',
  'package-lock.json': 'npm',
  'yarn.lock': 'yarn',
  'bun.lockb': 'bun',
};

// --- Section order (AC-16) ---------------------------------------------------

/** The fixed five sections, in order — response-driven ordering never
 *  applies (AC-16). */
export const SECTION_KINDS = [
  'architecture',
  'critical_paths',
  'run_locally',
  'reading_path',
  'first_tasks',
] as const;

// --- Q2: which index states get a tour, which get the skeleton --------------

/**
 * `partial` is still a working index (`repo-intel/repository.ts`'s own
 * comment: "'partial' is still a working index — no degraded flag") — only
 * `degraded`/`failed` refuse generation on status alone. The `graphFailed`
 * sub-case (a `partial` index with an empty import graph) is a SEPARATE
 * refusal check in `service.ts`, not encoded here, so flipping to the
 * literal spec reading (skeleton for `partial` too) stays a one-line change.
 */
export const GENERATABLE_STATUSES = ['full', 'partial'] as const;

/** Mirrors `repo-intel/constants.ts`'s `HOTNESS_WINDOW_DAYS` — used only as
 *  the provenance fallback when an index state predates hotness tracking. */
export const DEFAULT_HOTNESS_WINDOW_DAYS = 180;
