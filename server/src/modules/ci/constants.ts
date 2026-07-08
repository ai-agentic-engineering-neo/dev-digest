import type { CiTarget } from '@devdigest/shared';

/**
 * Shared constants for the CI export generators (manifest, slug, workflow).
 * Pure data — no I/O, no adapters. Consumed by `service.ts` (T5) to assemble
 * the exported file set and by the generators themselves.
 */

// ---------------------------------------------------------------------------
// `.devdigest/` on-disk layout (written into the TARGET repo by the export)
// ---------------------------------------------------------------------------

export const DEVDIGEST_DIR = '.devdigest';
export const AGENTS_DIR = `${DEVDIGEST_DIR}/agents`;
export const SKILLS_DIR = `${DEVDIGEST_DIR}/skills`;
export const MEMORY_FILE_PATH = `${DEVDIGEST_DIR}/memory.jsonl`;
export const RUNNER_DIR = `${DEVDIGEST_DIR}/runner`;
/** The bundled, self-contained agent-runner entry point (T7/T8) — invoked directly, never via a marketplace action (AC-19). */
export const RUNNER_ENTRY_PATH = `${RUNNER_DIR}/index.js`;
/** Command used by the review step of every generated CI config. */
export const RUNNER_RUN_COMMAND = `node ${RUNNER_ENTRY_PATH}`;

export function agentManifestPath(slug: string): string {
  return `${AGENTS_DIR}/${slug}.yaml`;
}

export function skillFilePath(slug: string): string {
  return `${SKILLS_DIR}/${slug}.md`;
}

// ---------------------------------------------------------------------------
// GitHub Actions workflow
// ---------------------------------------------------------------------------

/** Default install path for the generated GHA workflow (AC-4). */
export const GHA_WORKFLOW_PATH = '.github/workflows/devdigest-review.yml';

/** The only `pull_request` event types the generated workflow may ever trigger on (AC-18). */
export const ALLOWED_PULL_REQUEST_EVENTS = ['opened', 'synchronize', 'reopened'] as const;
export type AllowedPullRequestEvent = (typeof ALLOWED_PULL_REQUEST_EVENTS)[number];

/** Matches `CiExportInput.triggers` default in `contracts/eval-ci.ts`. */
export const DEFAULT_PULL_REQUEST_EVENTS: readonly AllowedPullRequestEvent[] = [
  'opened',
  'synchronize',
  'reopened',
];

/**
 * Event names that must NEVER appear in a generated workflow's `on:` block —
 * these fire on attacker-controlled PR/issue comments and are the classic
 * "comment-triggered secret exfiltration" vector (AC-18). Kept here so tests
 * can assert their absence by name instead of duplicating the literal list.
 */
export const FORBIDDEN_TRIGGER_EVENTS = ['issue_comment', 'pull_request_review_comment'] as const;

/** The exact, least-privilege permission set every generated GHA workflow must declare (AC-15). Order is significant for deterministic output. */
export const GHA_PERMISSIONS: readonly (readonly [string, 'read' | 'write'])[] = [
  ['contents', 'read'],
  ['pull-requests', 'write'],
];

/** Secret reference expressions — NEVER a literal value (AC-16). */
export const OPENROUTER_SECRET_EXPR = '${{ secrets.OPENROUTER_API_KEY }}';
export const GITHUB_TOKEN_SECRET_EXPR = '${{ secrets.GITHUB_TOKEN }}';

/** Condition gating the keyed analysis job so fork PRs never receive the secret (AC-17). */
export const FORK_GATE_CONDITION = 'github.event.pull_request.head.repo.fork == false';

/** GitHub Actions context expressions used in the generated workflow (non-secret). */
export const PR_HEAD_SHA_EXPR = '${{ github.event.pull_request.head.sha }}';
export const GITHUB_REPOSITORY_EXPR = '${{ github.repository }}';
export const PR_NUMBER_EXPR = '${{ github.event.pull_request.number }}';

/**
 * Name of the GitHub Actions artifact the generated workflow uploads
 * (`actions/upload-artifact`) and the pull-based ingest (`modules/ci/ingest.ts`)
 * downloads by name (AC-27). A single shared constant so the generator and the
 * ingest consumer can never drift apart.
 */
export const CI_RESULT_ARTIFACT_NAME = 'devdigest-result';

/**
 * Filename the agent-runner writes the CI result artifact to inside the job
 * workspace (see `agent-runner/src/index.ts`'s default `DEVDIGEST_RESULT_PATH`,
 * relative to `GITHUB_WORKSPACE`) — also the exact entry name inside the
 * uploaded/downloaded artifact zip.
 */
export const CI_RESULT_FILE_NAME = 'devdigest-result.json';

/** Values `agent-runner/src/index.ts::resolvePostAs` accepts (AC-24). Kept here
 *  so `workflow.ts` never hand-writes the literal enum. */
export const POST_AS_VALUES = ['github_review', 'pr_comment', 'none'] as const;
export type CiPostAs = (typeof POST_AS_VALUES)[number];

/** Matches `CiExportInput.post_as`'s Zod default and `resolvePostAs`'s fallback. */
export const DEFAULT_POST_AS: CiPostAs = 'github_review';

// ---------------------------------------------------------------------------
// Non-GHA targets (Non-goal: single downloadable config file, no PR/ingest wiring)
// ---------------------------------------------------------------------------

export const CI_TARGET_FILE_PATHS: Record<Exclude<CiTarget, 'gha'>, string> = {
  circle: '.circleci/config.yml',
  jenkins: 'Jenkinsfile',
  cli: `${DEVDIGEST_DIR}/run-review.sh`,
};
