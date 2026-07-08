import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import type { LLMProvider, GitHubReviewPayload, CiResultArtifact } from '@devdigest/shared';
import { reviewPullRequest, toReviewPayload, gateTriggered, countBlockers } from '@devdigest/reviewer-core';
import { loadManifests } from './manifest.js';
import { loadSkillBodies } from './skills.js';
import { resolvePrContext, type CiEnv } from './context.js';
import { parseUnifiedDiff, stripIgnoredFiles } from './diff.js';
import { fetchPrDiff, postGithubReview, postPrComment, type FetchLike } from './github.js';
import { buildResultArtifact } from './artifact.js';
import { RunnerError } from './errors.js';

/**
 * `runCi` — the runner's single orchestration entry point (T8). Mirrors the
 * pipeline a local studio review runs (assemblePrompt/wrapUntrusted →
 * completeStructured → groundFindings, all INSIDE `reviewPullRequest`) so CI
 * and local stay in parity (AC-36): this file never re-implements or
 * hand-rolls any of that — it only resolves CI-specific inputs (manifest,
 * skills, diff, PR context) and hands them to the SAME reviewer-core engine
 * the studio calls, then turns the grounded result into GitHub side effects.
 *
 * Deterministic gate (AC-23): the GitHub review event + blocker count are
 * computed from `countBlockers`/`gateTriggered` + the manifest's `ci_fail_on`
 * against the GROUNDED findings — never from `review.verdict` (the model's
 * self-report), which is discarded here on purpose.
 *
 * Hard-fail (Q5): a single try/catch wraps the ENTIRE pipeline. Any failure —
 * invalid manifest (AC-20), missing skill file, unresolvable CI context,
 * diff-fetch failure, or an LLM/model-call error inside `reviewPullRequest` —
 * short-circuits to `{ exitCode: 1, artifact: null, posted: null }` before any
 * GitHub post or artifact write. Do not add per-stage catches that post partial
 * state; the whole point is that a failure anywhere upstream of "we have a
 * grounded review" produces NOTHING (no synthetic review skeleton).
 */

export type PostAs = 'github_review' | 'pr_comment' | 'none';

export interface RunCiDeps {
  /** Directory containing `agents/` and `skills/` (checked-in `.devdigest/`). */
  devdigestDir: string;
  env: CiEnv;
  /** Injected LLM provider — `OpenRouterProvider` in production, a stub in tests. */
  llm: LLMProvider;
  /** How to post the result — `'github_review' | 'pr_comment' | 'none'` (AC-24). */
  postAs: PostAs;
  /** Absolute path to write the `CiResultArtifact` JSON to. */
  resultPath: string;
  fetchImpl?: FetchLike;
  readFile?: typeof readFileSync;
  readDir?: typeof readdirSync;
  writeFile?: typeof writeFileSync;
  now?: () => number;
  /**
   * Override diff retrieval (tests supply a fixture diff directly instead of
   * hitting the GitHub API). Defaults to `fetchPrDiff` via the GitHub REST API.
   */
  fetchDiff?: (
    ctx: { owner: string; repo: string; prNumber: number },
    token: string,
    fetchImpl: FetchLike,
  ) => Promise<string>;
}

/** Per-agent outcome — one entry per manifest under `.devdigest/agents/`. */
export interface AgentRunResult {
  agent: string;
  artifact: CiResultArtifact;
  posted: { kind: PostAs; payload?: GitHubReviewPayload };
  blockers: number;
  gateTriggered: boolean;
}

export interface RunCiSuccess {
  exitCode: number;
  /** One result per reviewer, in manifest-filename order. */
  results: AgentRunResult[];
  /** The `CiResultArtifact[]` written to disk (one per reviewer). */
  artifacts: CiResultArtifact[];
  error?: undefined;
}

export interface RunCiFailure {
  exitCode: number;
  results: null;
  artifacts: null;
  error: string;
}

export type RunCiResult = RunCiSuccess | RunCiFailure;

export async function runCi(deps: RunCiDeps): Promise<RunCiResult> {
  const readFile = deps.readFile ?? readFileSync;
  const readDir = deps.readDir ?? readdirSync;
  const writeFile = deps.writeFile ?? writeFileSync;
  const now = deps.now ?? Date.now;
  const fetchImpl = deps.fetchImpl ?? fetch;
  const fetchDiffImpl = deps.fetchDiff ?? fetchPrDiff;

  try {
    // 1. Load + validate EVERY manifest BEFORE any is used (AC-20). Multiple
    //    manifests = multiple reviewers (lesson-7 multi-agent); each is run and
    //    posted independently. Any invalid manifest fails the whole run here.
    const manifests = loadManifests(deps.devdigestDir, { readFile, readDir });

    // 2. Resolve CI context (PR number/title/body/repo) from env + event payload.
    const ctx = resolvePrContext(deps.env, readFile);

    const githubToken = deps.env.GITHUB_TOKEN;
    if (deps.postAs !== 'none' && !githubToken) {
      throw new RunnerError(`GITHUB_TOKEN is required to post as '${deps.postAs}'`);
    }

    // 3. Assemble the diff ONCE — it is the same PR diff for every reviewer.
    //    Strip DevDigest's own exported artifacts (`.devdigest/**`, the generated
    //    workflow) BEFORE parse: the minified runner bundle would otherwise fail
    //    the whole review with a GitHub 422 "diff too large", and reviewing our
    //    own config is noise.
    const rawDiff = await fetchDiffImpl(ctx, githubToken ?? '', fetchImpl);
    const diff = parseUnifiedDiff(stripIgnoredFiles(rawDiff));

    // 4. Run each reviewer through the SAME engine the studio uses. Reviews are
    //    computed for ALL agents FIRST (no posting yet) so that a failure in any
    //    one reviewer hard-fails the whole run with nothing posted and no
    //    artifact written (Q5) — never a partial batch.
    const computed = manifests.map((manifest) => {
      const skills = loadSkillBodies(deps.devdigestDir, manifest.skills, readFile);
      const start = now();
      return reviewPullRequest({
        systemPrompt: manifest.system_prompt,
        model: manifest.model,
        diff,
        llm: deps.llm,
        strategy: manifest.strategy,
        skills,
        prDescription: ctx.body,
        task: `Review PR #${ctx.prNumber}: ${ctx.title}`,
        // `reviewPullRequest` internally applies assemblePrompt/wrapUntrusted
        // (AC-21) + the mandatory groundFindings() gate (AC-22).
      }).then((outcome) => ({ manifest, outcome, durationMs: now() - start }));
    });
    const reviews = await Promise.all(computed);

    // 5. Per-agent deterministic verdict/gate from GROUNDED findings + each
    //    manifest's `ci_fail_on` (AC-23) — never the model's self-report.
    const results: AgentRunResult[] = reviews.map(({ manifest, outcome, durationMs }) => ({
      agent: manifest.name,
      artifact: buildResultArtifact({
        findings: outcome.review.findings,
        costUsd: outcome.costUsd,
        durationMs,
        agent: manifest.name,
        prNumber: ctx.prNumber,
      }),
      posted: {
        kind: deps.postAs,
        payload: toReviewPayload(outcome.review, {
          failOn: manifest.ci_fail_on,
          diff,
          title: manifest.name,
        }),
      },
      blockers: countBlockers(outcome.review.findings, manifest.ci_fail_on),
      gateTriggered: gateTriggered(outcome.review.findings, manifest.ci_fail_on),
    }));

    // 6. Write the artifact array before posting, so a GitHub-side posting
    //    failure never loses the already-computed, already-grounded results.
    const artifacts = results.map((r) => r.artifact);
    writeFile(deps.resultPath, `${JSON.stringify(artifacts, null, 2)}\n`);

    // 7. Post each reviewer's result per `post_as` (AC-24).
    for (const r of results) {
      if (deps.postAs === 'github_review') {
        await postGithubReview(ctx, githubToken as string, r.posted.payload!, fetchImpl);
      } else if (deps.postAs === 'pr_comment') {
        await postPrComment(ctx, githubToken as string, r.posted.payload!.body, fetchImpl);
      }
      // 'none' → post nothing (exit-code only).
    }

    // 8. Exit non-zero IFF ANY reviewer's gate triggered REQUEST_CHANGES (AC-25).
    return {
      exitCode: results.some((r) => r.gateTriggered) ? 1 : 0,
      results,
      artifacts,
    };
  } catch (err) {
    // Hard-fail (Q5): non-zero exit, nothing posted, no artifact, no synthetic
    // review skeleton — regardless of which stage above threw.
    const message = err instanceof Error ? err.message : String(err);
    return { exitCode: 1, results: null, artifacts: null, error: message };
  }
}
