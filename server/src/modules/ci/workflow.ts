import type { CiFile, CiTarget } from '@devdigest/shared';
import {
  ALLOWED_PULL_REQUEST_EVENTS,
  CI_RESULT_ARTIFACT_NAME,
  CI_RESULT_FILE_NAME,
  CI_TARGET_FILE_PATHS,
  DEFAULT_POST_AS,
  DEFAULT_PULL_REQUEST_EVENTS,
  FORK_GATE_CONDITION,
  GHA_PERMISSIONS,
  GHA_WORKFLOW_PATH,
  GITHUB_REPOSITORY_EXPR,
  GITHUB_TOKEN_SECRET_EXPR,
  OPENROUTER_SECRET_EXPR,
  POST_AS_VALUES,
  PR_HEAD_SHA_EXPR,
  PR_NUMBER_EXPR,
  RUNNER_RUN_COMMAND,
  type AllowedPullRequestEvent,
  type CiPostAs,
} from './constants.js';

/**
 * Pure CI config generators. The GitHub Actions generator (`buildGhaWorkflowYaml`)
 * is the core lethal-trifecta mitigation for this feature — every invariant
 * below is load-bearing security, not style:
 *
 *  - `permissions:` is EXACTLY `contents: read` + `pull-requests: write` (AC-15).
 *  - The OpenRouter key is referenced ONLY via `${{ secrets.OPENROUTER_API_KEY }}`
 *    — never a literal (AC-16).
 *  - The event is `pull_request` (NOT `pull_request_target`, which runs with the
 *    base repo's secrets/permissions against attacker-controlled fork code), and
 *    the keyed job is gated off entirely for fork PRs (AC-17).
 *  - `on:` is restricted to a whitelisted subset of `pull_request` types — never
 *    `issue_comment` / `pull_request_review_comment`, which are the classic
 *    comment-triggered secret-exfiltration vector (AC-18).
 *  - The review step invokes the bundled runner directly
 *    (`node .devdigest/runner/index.js`) — no marketplace `uses:` action (AC-19).
 *  - The result artifact (`devdigest-result.json`) is uploaded via
 *    `actions/upload-artifact` under the shared `CI_RESULT_ARTIFACT_NAME`, with
 *    `if: always()` so a REQUEST_CHANGES (non-zero exit) run still uploads its
 *    result for the pull-based ingest to retrieve (AC-27). The upload step sits
 *    inside the same fork-gated job — fork PRs still get no secret and produce
 *    no artifact.
 *  - `DEVDIGEST_POST_AS` is forwarded from `CiExportInput.post_as` (AC-24),
 *    restricted to the values `agent-runner`'s `resolvePostAs` accepts, and
 *    defaults to `github_review` when unset.
 *
 * Non-GHA targets (circle/jenkins/cli) are intentionally minimal: a single
 * downloadable config file, no PR/ingest wiring (Non-goal).
 */

export interface GhaWorkflowOptions {
  /**
   * Requested `pull_request` trigger types (e.g. from `CiExportInput.triggers`).
   * Silently filtered down to the whitelist in `ALLOWED_PULL_REQUEST_EVENTS` —
   * this filtering is defense-in-depth: even a caller bug or corrupted input can
   * never smuggle a comment-based trigger into the generated workflow (AC-18).
   * Falls back to `DEFAULT_PULL_REQUEST_EVENTS` if nothing valid remains.
   */
  triggers?: readonly string[];
  /**
   * Requested `CiExportInput.post_as` value, forwarded verbatim into the
   * review step's `DEVDIGEST_POST_AS` env var (AC-24). Whitelist-filtered
   * against `POST_AS_VALUES` (defense-in-depth, same rationale as `triggers`)
   * and falls back to `DEFAULT_POST_AS` when unset/unrecognized.
   */
  postAs?: string;
}

/** Whitelist-filter + de-dupe requested triggers, preserving canonical order. */
function normalizeTriggers(triggers: readonly string[] | undefined): AllowedPullRequestEvent[] {
  const requested = triggers && triggers.length > 0 ? triggers : DEFAULT_PULL_REQUEST_EVENTS;
  const requestedSet = new Set(requested);
  const filtered = ALLOWED_PULL_REQUEST_EVENTS.filter((event) => requestedSet.has(event));
  return filtered.length > 0 ? filtered : [...DEFAULT_PULL_REQUEST_EVENTS];
}

/** Whitelist-filter the requested `post_as`, falling back to the default (AC-24). */
function normalizePostAs(postAs: string | undefined): CiPostAs {
  return (POST_AS_VALUES as readonly string[]).includes(postAs ?? '')
    ? (postAs as CiPostAs)
    : DEFAULT_POST_AS;
}

/** Build the `permissions:` block text (AC-15) from the canonical constant list. */
function buildPermissionsBlock(): string {
  return GHA_PERMISSIONS.map(([key, value]) => `  ${key}: ${value}`).join('\n');
}

/**
 * Generate the GitHub Actions workflow YAML. See module doc comment for the
 * security invariants this function must never regress.
 */
export function buildGhaWorkflowYaml(options: GhaWorkflowOptions = {}): string {
  const triggers = normalizeTriggers(options.triggers);
  const postAs = normalizePostAs(options.postAs);
  const permissionsBlock = buildPermissionsBlock();

  return `name: DevDigest Review

on:
  pull_request:
    types: [${triggers.join(', ')}]

permissions:
${permissionsBlock}

jobs:
  review:
    name: DevDigest Review
    runs-on: ubuntu-latest
    # Fork PRs never receive OPENROUTER_API_KEY / GITHUB_TOKEN: this job simply
    # does not run for them (AC-17). The workflow uses the standard
    # 'pull_request' event, never the base-repo-privileged variant that would
    # run with base-repo secrets/permissions against untrusted fork code.
    if: ${FORK_GATE_CONDITION}
    steps:
      - name: Checkout PR head
        uses: actions/checkout@v4
        with:
          ref: ${PR_HEAD_SHA_EXPR}
          fetch-depth: 0

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22'

      - name: Run DevDigest review
        env:
          OPENROUTER_API_KEY: ${OPENROUTER_SECRET_EXPR}
          GITHUB_TOKEN: ${GITHUB_TOKEN_SECRET_EXPR}
          GITHUB_REPOSITORY: ${GITHUB_REPOSITORY_EXPR}
          PR_NUMBER: ${PR_NUMBER_EXPR}
          DEVDIGEST_POST_AS: ${postAs}
        run: ${RUNNER_RUN_COMMAND}

      - name: Upload review result artifact
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: ${CI_RESULT_ARTIFACT_NAME}
          path: ${CI_RESULT_FILE_NAME}
`;
}

/** `buildGhaWorkflowYaml` wrapped as an installable `CiFile` at the default path (AC-4). */
export function buildGhaWorkflowFile(options: GhaWorkflowOptions = {}): CiFile {
  return {
    path: GHA_WORKFLOW_PATH,
    contents: buildGhaWorkflowYaml(options),
    editable: true,
  };
}

// ---------------------------------------------------------------------------
// Non-GHA targets — single downloadable config file, no PR/ingest wiring.
// ---------------------------------------------------------------------------

/** CircleCI config invoking the bundled runner. Secret read from a CircleCI project env var — never a literal. */
function buildCircleCiConfigYaml(): string {
  return `version: 2.1

jobs:
  devdigest-review:
    docker:
      - image: cimg/node:22.11
    steps:
      - checkout
      - run:
          name: Run DevDigest review
          command: ${RUNNER_RUN_COMMAND}
          environment:
            # Set OPENROUTER_API_KEY / GITHUB_TOKEN as CircleCI project/context
            # environment variables — never commit them here.
            PLACEHOLDER: "configure OPENROUTER_API_KEY and GITHUB_TOKEN as CircleCI env vars"

workflows:
  devdigest-review:
    jobs:
      - devdigest-review:
          filters:
            branches:
              ignore: []
`;
}

/** Jenkinsfile invoking the bundled runner. Secrets bound via Jenkins credentials, never literals. */
function buildJenkinsfile(): string {
  return `pipeline {
  agent any
  stages {
    stage('DevDigest Review') {
      steps {
        withCredentials([
          string(credentialsId: 'openrouter-api-key', variable: 'OPENROUTER_API_KEY'),
          string(credentialsId: 'github-token', variable: 'GITHUB_TOKEN')
        ]) {
          sh '${RUNNER_RUN_COMMAND}'
        }
      }
    }
  }
}
`;
}

/** Standalone shell script invoking the bundled runner from any CLI/CI environment. */
function buildCliScript(): string {
  return `#!/usr/bin/env bash
set -euo pipefail

# Required environment variables (export these before running, never hardcode):
#   OPENROUTER_API_KEY
#   GITHUB_TOKEN (optional — only needed to post the review back to GitHub)

if [[ -z "\${OPENROUTER_API_KEY:-}" ]]; then
  echo "OPENROUTER_API_KEY is not set" >&2
  exit 1
fi

${RUNNER_RUN_COMMAND}
`;
}

/**
 * Generate the config file(s) for a given CI target. GHA returns the full
 * workflow at its installable path; the other targets each return exactly one
 * standalone, downloadable config file with no PR/ingest wiring (Non-goal).
 */
export function buildCiConfigFiles(target: CiTarget, options: GhaWorkflowOptions = {}): CiFile[] {
  switch (target) {
    case 'gha':
      return [buildGhaWorkflowFile(options)];
    case 'circle':
      return [{ path: CI_TARGET_FILE_PATHS.circle, contents: buildCircleCiConfigYaml(), editable: true }];
    case 'jenkins':
      return [{ path: CI_TARGET_FILE_PATHS.jenkins, contents: buildJenkinsfile(), editable: true }];
    case 'cli':
      return [{ path: CI_TARGET_FILE_PATHS.cli, contents: buildCliScript(), editable: true }];
    default: {
      const exhaustive: never = target;
      throw new Error(`Unsupported CI target: ${String(exhaustive)}`);
    }
  }
}
