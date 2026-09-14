/**
 * specs/14-export-to-ci.md (P2, security-critical) — paths, branch name,
 * pinned action commits and the one secret name the generated bundle
 * depends on. Every generator file in this module imports from here; never
 * inline a literal path, branch name or `uses:` ref anywhere else in
 * `modules/ci/**`.
 */

export const WORKFLOW_PATH = '.github/workflows/devdigest.yml';

// P-2 — the "runner bundle" is a DIRECTORY of files (today: `index.js`, the
// ncc bundle; `310.index.js`, a lazily-`import()`ed webpack chunk `index.js`
// itself references; and `package.json`, `{"type":"module"}`, required for
// ESM resolution in a target repo whose own `package.json` says `commonjs`
// or is absent) — never an enumerated allow-list. `bundle.ts` copies
// whatever `agent-runner/dist/` actually contains, wholesale, so a chunk-set
// change on a future `agent-runner` rebuild is picked up automatically.
export const RUNNER_DIR = '.devdigest/runner';
export const RUNNER_ENTRYPOINT_FILE = 'index.js';
// The path the generated workflow's `run:` step executes.
export const RUNNER_BUNDLE_PATH = `${RUNNER_DIR}/${RUNNER_ENTRYPOINT_FILE}`;
export const MEMORY_PATH = '.devdigest/memory.jsonl';

// D18/AC-16 — the runner throws when it finds zero OR more than one manifest
// under `.devdigest/agents/` (`agent-runner/src/manifest.ts:37-44`), and one
// installation is always exactly one agent (D2). The manifest's FILE PATH is
// therefore a fixed, non-agent-authored slug — never the agent's own
// (possibly hostile) name — while the file's CONTENTS carry the real name
// intact (AC-12).
export const AGENT_SLUG = 'agent';
export function agentManifestPath(): string {
  return `.devdigest/agents/${AGENT_SLUG}.yaml`;
}

/**
 * `slug` here is a SKILL's own `name` column, already constrained to
 * `SKILL_NAME_RE` (`^[a-z0-9][a-z0-9-]*$`) at skill-creation time
 * (`server/src/db/schema/skills.ts`) — safe to use as a path segment as-is.
 */
export function skillFilePath(slug: string): string {
  return `.devdigest/skills/${slug}.md`;
}

/** The dedicated branch DevDigest publishes the bundle to (D3/AC-7) —
 *  `commitFiles` creates it from `base` if missing, else fast-forwards it. */
export const CI_BRANCH = 'devdigest/ci';

/**
 * D-P6/AC-62 — every official action pinned to a full commit SHA, resolved
 * via `gh api repos/<owner>/<repo>/git/ref/tags/v4 --jq .object.sha`
 * (verified 2026-08-20). Re-resolve and bump the trailing `version` comment
 * if these tags move to a new release; never reference a tag or branch
 * directly in the generated workflow.
 */
export const PINNED_ACTIONS = {
  checkout: { sha: '11d5960a326750d5838078e36cf38b85af677262', version: 'v4.4.0' },
  setupNode: { sha: '49933ea5288caeca8642d1e84afbd3f7d6820020', version: 'v4.4.0' },
  uploadArtifact: { sha: 'ea165f8d65b6e75b540449e92b4886f43607fa02', version: 'v4.6.2' },
} as const;

/** AC-6/AC-64 — the one secret name the Configure step checks and the
 *  workflow references; `GITHUB_TOKEN` is CI-provided and needs no lookup. */
export const OPENROUTER_SECRET_NAME = 'OPENROUTER_API_KEY';

/** Filenames the generated workflow publishes as ONE uploaded artifact
 *  (D-P2): the runner's own result document, and the sidecar the workflow
 *  itself writes from GitHub Actions context. */
export const RESULT_FILENAME = 'devdigest-result.json';
export const RUN_META_FILENAME = 'devdigest-run.json';

/** The trigger events the Configure step may select from (AC-4). */
export const CI_TRIGGERS = ['opened', 'synchronize', 'reopened'] as const;
export type CiTriggerEvent = (typeof CI_TRIGGERS)[number];
