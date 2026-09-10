import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import type { LLMProvider, GitHubReviewPayload, CiResultArtifact } from '@devdigest/shared';
import { reviewPullRequest, toReviewPayload, gateTriggered, countBlockers } from '@devdigest/reviewer-core';
import { loadManifests } from './manifest.js';
import { loadSkillBodies } from './skills.js';
import { resolvePrContext, type CiEnv } from './context.js';
import { parseUnifiedDiff, stripIgnoredFiles } from './diff.js';
import { fetchPrDiff, postGithubReview, postPrComment, type FetchLike } from './github.js';
import { buildResultArtifact, type AgentResultInput } from './artifact.js';
import { mergeAgentReviews, type AgentPayload, type SeverityCounts } from './merge.js';
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
 * Several reviewers may be installed in one repository: every manifest under
 * `.devdigest/agents/` is reviewed, in manifest order, against the SAME diff,
 * and `merge.ts` folds the per-agent payloads into the one review this job
 * posts. One agent is the degenerate case of that loop, not a separate path.
 *
 * Deterministic gate (AC-23): each agent's review event + blocker count are
 * computed from `countBlockers`/`gateTriggered` + THAT agent's own
 * `ci_fail_on` against the GROUNDED findings — never from `review.verdict`
 * (the model's self-report), which is discarded here on purpose. The job's
 * own gate is a strict OR across agents (`mergeAgentReviews`).
 *
 * Hard-fail (Q5): a single try/catch wraps the ENTIRE pipeline. Any failure —
 * invalid manifest (AC-20), missing skill file, unresolvable CI context,
 * diff-fetch failure, or an LLM/model-call error inside `reviewPullRequest` —
 * short-circuits to `{ exitCode: 1, artifact: null, posted: null }` — including
 * a failure in the SECOND of two agents, which discards the first one's
 * completed review rather than posting half a roster's verdict — before any
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

export interface RunCiSuccess {
  exitCode: number;
  artifact: CiResultArtifact;
  posted: { kind: PostAs; payload?: GitHubReviewPayload };
  blockers: number;
  gateTriggered: boolean;
  error?: undefined;
}

export interface RunCiFailure {
  exitCode: number;
  artifact: null;
  posted: null;
  blockers?: undefined;
  gateTriggered?: undefined;
  error: string;
}

export type RunCiResult = RunCiSuccess | RunCiFailure;

/** Severity tally over GROUNDED findings — the same shape `artifact.ts`
 *  computes for the result document, kept local rather than shared because
 *  the two consumers must stay free to diverge (one is a wire contract). */
function severityCounts(findings: readonly { severity: string }[]): SeverityCounts {
  const counts: SeverityCounts = { critical: 0, warning: 0, suggestion: 0 };
  for (const f of findings) {
    if (f.severity === 'CRITICAL') counts.critical++;
    else if (f.severity === 'WARNING') counts.warning++;
    else counts.suggestion++;
  }
  return counts;
}

export async function runCi(deps: RunCiDeps): Promise<RunCiResult> {
  const readFile = deps.readFile ?? readFileSync;
  const readDir = deps.readDir ?? readdirSync;
  const writeFile = deps.writeFile ?? writeFileSync;
  const now = deps.now ?? Date.now;
  const fetchImpl = deps.fetchImpl ?? fetch;
  const fetchDiffImpl = deps.fetchDiff ?? fetchPrDiff;

  try {
    // 1. Load + validate EVERY manifest BEFORE any of them is used (AC-20).
    //    A repo may install several reviewers into this one job; an invalid
    //    manifest anywhere fails the whole run rather than silently reviewing
    //    with the subset that happened to parse.
    const manifests = loadManifests(deps.devdigestDir, { readFile, readDir });

    // 2. Resolve CI context (PR number/title/body/repo) from env + event payload.
    const ctx = resolvePrContext(deps.env, readFile);

    // Required unconditionally: the diff fetch below always authenticates,
    // even when postAs is 'none' — an empty token still sends a malformed
    // `Authorization: Bearer` header, which GitHub rejects with a 401.
    const githubToken = deps.env.GITHUB_TOKEN;
    if (!githubToken) {
      throw new RunnerError('GITHUB_TOKEN is required to fetch the PR diff');
    }

    // 3. Assemble the diff ONCE for every agent. Strip DevDigest's own exported
    //    artifacts (`.devdigest/**`, the generated workflow) BEFORE parse: the
    //    minified runner bundle would otherwise fail the whole review with a
    //    GitHub 422 "diff too large", and reviewing our own config is noise.
    const rawDiff = await fetchDiffImpl(ctx, githubToken ?? '', fetchImpl);
    const diff = parseUnifiedDiff(stripIgnoredFiles(rawDiff));

    // 4. Run the SAME engine the studio uses, once per agent, in manifest
    //    order. Sequential on purpose: the agents share one OpenRouter key and
    //    one rate limit, and a CI job has no deadline pressure that would
    //    justify hammering it with N concurrent completions.
    //    `reviewPullRequest` internally calls `assemblePrompt`/`wrapUntrusted`
    //    (diff → `<untrusted source="diff">`, prDescription → `<untrusted
    //    source="pr-description">`, AC-21) and the mandatory `groundFindings()`
    //    gate (AC-22: an all-dropped result is a valid zero-finding review, not
    //    an error — it flows through normally below).
    const agentPayloads: AgentPayload[] = [];
    const agentResults: AgentResultInput[] = [];

    for (const manifest of manifests) {
      const start = now();
      const outcome = await reviewPullRequest({
        systemPrompt: manifest.system_prompt,
        model: manifest.model,
        diff,
        llm: deps.llm,
        strategy: manifest.strategy,
        skills: loadSkillBodies(deps.devdigestDir, manifest.skills, readFile),
        prDescription: ctx.body,
        task: `Review PR #${ctx.prNumber}: ${ctx.title}`,
      });
      const durationMs = now() - start;

      // 5. Deterministic verdict/gate from GROUNDED findings + THIS agent's
      //    own `ci_fail_on` (AC-23) — never `outcome.review.verdict`, and
      //    never a policy blended across agents.
      const payload = toReviewPayload(outcome.review, {
        failOn: manifest.ci_fail_on,
        diff,
        title: manifest.name,
      });
      const blockers = countBlockers(outcome.review.findings, manifest.ci_fail_on);
      const triggered = gateTriggered(outcome.review.findings, manifest.ci_fail_on);

      const counts = severityCounts(outcome.review.findings);
      agentPayloads.push({
        agent: manifest.name,
        payload,
        gateTriggered: triggered,
        blockers,
        findingsCount: outcome.review.findings.length,
        counts,
      });
      agentResults.push({
        agent: manifest.name,
        findings: outcome.review.findings,
        costUsd: outcome.costUsd,
        durationMs,
        blockers,
        gateTriggered: triggered,
      });
    }

    // 6. Merge into the ONE review this job posts, and build + write the
    //    artifact before posting, so a GitHub-side posting failure never loses
    //    the already-computed, already-grounded results.
    const merged = mergeAgentReviews(agentPayloads);
    const payload = merged.payload;
    const blockers = merged.blockers;
    const triggered = merged.gateTriggered;

    const artifact = buildResultArtifact({ agents: agentResults, prNumber: ctx.prNumber });
    writeFile(deps.resultPath, `${JSON.stringify(artifact, null, 2)}\n`);

    // 7. Post per `post_as` (AC-24).
    if (deps.postAs === 'github_review') {
      await postGithubReview(ctx, githubToken as string, payload, fetchImpl);
    } else if (deps.postAs === 'pr_comment') {
      await postPrComment(ctx, githubToken as string, payload.body, fetchImpl);
    }
    // 'none' → post nothing (exit-code only).

    // 8. Exit non-zero IFF the gate triggered REQUEST_CHANGES (AC-25).
    return {
      exitCode: triggered ? 1 : 0,
      artifact,
      posted: { kind: deps.postAs, payload },
      blockers,
      gateTriggered: triggered,
    };
  } catch (err) {
    // Hard-fail (Q5): non-zero exit, nothing posted, no artifact, no synthetic
    // review skeleton — regardless of which stage above threw.
    const message = err instanceof Error ? err.message : String(err);
    return { exitCode: 1, artifact: null, posted: null, error: message };
  }
}
