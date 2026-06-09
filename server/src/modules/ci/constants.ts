/** A4 CI module constants. */

/** Source tag persisted on ingested CI runs. */
export const CI_RUN_SOURCE = 'github_actions';

/** Generated workflow path added by the export. */
export const WORKFLOW_PATH = '.github/workflows/devdigest-review.yml';

/** Default PR title used when opening the export PR. */
export const EXPORT_PR_TITLE = 'Add DevDigest CI review';

/** Branch used for the export PR. */
export const EXPORT_BRANCH = 'devdigest/ci';

/** Directory prefix for generated agent manifests. */
export const AGENTS_DIR = '.devdigest/agents';

/** Directory prefix for generated skill files. */
export const SKILLS_DIR = '.devdigest/skills';

/** Path of the generated (empty) memory file. */
export const MEMORY_PATH = '.devdigest/memory.jsonl';

/** Artifact name uploaded by the generated workflow / read on ingest. */
export const RESULT_ARTIFACT_NAME = 'devdigest-result';

/** Run-status buckets derived from an Actions conclusion. */
export const RUN_STATUS = {
  succeeded: 'succeeded',
  noFindings: 'no_findings',
  failed: 'failed',
  running: 'running',
} as const;
