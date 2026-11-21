import type { CiFailOn, Provider, Review, ReviewStrategy, RunTrace, UnifiedDiff } from '@devdigest/shared';
import { reviewPullRequest, countBlockers } from '@devdigest/reviewer-core';
import { RunLogger } from '../../platform/run-logger.js';
import type { RunBus } from '../../platform/sse.js';
import type { GitClient } from '../../domain/ports/git.js';
import type { LLMProvider } from '../../domain/ports/llm.js';
import type { RepoIntel } from '../../domain/ports/repo-intel.js';
import type { Tokenizer } from '../../domain/ports/tokenizer.js';
import type { ReviewRepository, FindingRow, PullRow, ReviewRow } from './repository.js';
import { REVIEW_STRATEGY } from './constants.js';
import { promptAssemblySections, taskLine } from './helpers.js';
import { loadDiff } from './diff-loader.js';
// THE one skill renderer, shared with `GET /skills/:id/preview`. Never
// re-implement this formatting here — a second copy makes the Preview tab lie.
import { renderSkillBlock, type RenderableSkill } from '../_shared/skill-render.js';
import { buildFallbackTrace, buildTrace, rankNote, renderCallersDigest } from './run-trace-rules.js';

/** Thrown by a run when the user cancels it mid-flight (between map files). */
export class RunCancelledError extends Error {
  constructor() {
    super('Run cancelled');
    this.name = 'RunCancelledError';
  }
}

/** Minimal structured logger (pino-compatible: (obj, msg)) for runtime logs. */
export type Logger = {
  info: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
  debug: (obj: unknown, msg?: string) => void;
};

// A reduced "Review per file" — same schema as Review (the model returns a small
// Review per file; we merge findings + take the worst verdict / mean score).
export type RunOutcome = {
  review: ReviewRow;
  findings: FindingRow[];
  grounding: string;
  raw: Review;
};

/** Repo fields the executor reads — local structural form (a full `RepoRow` satisfies it). */
export interface RunRepoRow {
  owner: string;
  name: string;
  clonePath: string | null;
}

/** Agent fields the executor reads — local structural form (a full `AgentRow` satisfies it). */
export interface RunAgent {
  id: string;
  name: string;
  provider: string;
  model: string;
  systemPrompt: string;
  strategy: ReviewStrategy | null;
  repoIntel: boolean | null;
  version: number;
  ciFailOn: CiFailOn;
}

/** The persistence surface the executor uses (a `ReviewRepository` satisfies it). */
export type RunRepo = Pick<
  ReviewRepository,
  | 'completeAgentRun'
  | 'saveRunTrace'
  | 'recordRunSkills'
  | 'insertReview'
  | 'insertFindings'
  | 'markReviewed'
  | 'getPrFiles'
>;

/** Structural mirror of the intent resolver's input/result (modules don't import each other). */
export interface RunIntentInput {
  workspaceId: string;
  pull: { id: string; title: string; body: string | null };
  repo: RunRepoRow;
  diffFiles: {
    path: string;
    hunks: { oldStart: number; oldLines: number; newStart: number; newLines: number }[];
  }[];
  onSignal?: (msg: string) => void;
}
export interface RunIntentResult {
  rendered?: string;
  inScope?: string[];
  outOfScope?: string[];
  contextGaps?: string[];
  provider?: string | null;
  model?: string | null;
  userMessageText?: string;
}

/** Structural mirror of the project-context run resolution. */
export interface RunProjectContext {
  documents: { path: string; content: string }[];
  entries: {
    path: string;
    tokens: number;
    origin: RunTrace['specs_read'][number]['origin'];
    skill: RunTrace['specs_read'][number]['skill'];
    status: RunTrace['specs_read'][number]['status'];
    reason: RunTrace['specs_read'][number]['reason'];
  }[];
}

/** Everything the executor needs besides persistence — injected, never the container. */
export interface RunExecutorDeps {
  agents: { enabledSkills(agentId: string): Promise<(RenderableSkill & { id: string })[]> };
  llm: (provider: Provider) => Promise<LLMProvider>;
  runBus: RunBus;
  tokenizer: Pick<Tokenizer, 'count'>;
  git: Pick<GitClient, 'diff'>;
  resolveIntent: (input: RunIntentInput) => Promise<RunIntentResult>;
  resolveProjectContext: (workspaceId: string, agentId: string, repoId: string) => Promise<RunProjectContext>;
  repoIntel: Pick<RepoIntel, 'getCallerSignatures' | 'getRepoMap' | 'getFileRank'>;
  promptAssemblyDebugEnabled: boolean;
}

/**
 * Owns the background execution of queued agent runs (extracted from
 * ReviewService; behaviour unchanged). Loads the diff + intent once, then
 * map-reduces each agent, streaming events over the runBus and persisting each
 * review. Per-agent failures are isolated.
 */
export class ReviewRunExecutor {
  constructor(
    private repo: RunRepo,
    private deps: RunExecutorDeps,
  ) {}

  /**
   * Background execution of the queued agent runs (NOT awaited by the route).
   * Loads the diff + intent once, then map-reduces each agent, streaming events
   * over the runBus and persisting each review. Per-agent failures are isolated.
   */
  async executeRuns(
    workspaceId: string,
    pull: PullRow,
    repo: RunRepoRow,
    jobs: { agent: RunAgent; runId: string }[],
    logger?: Logger,
  ): Promise<void> {
    // ONE logger fanned out over every queued run: shared pre-work (diff +
    // intent) is streamed into each target agent's Live Log and persisted into
    // each run's trace. Per-agent work below narrows it to a single run.
    const runLog = new RunLogger(
      this.deps.runBus,
      jobs.map((j) => j.runId),
      logger,
      { prId: pull.id },
    );

    // Pre-work failure (e.g. diff load) fails EVERY queued run. The error was
    // already emitted via runLog (fanned out → in each run's buffer); here we
    // mark the rows failed and persist the buffered log so it survives a reload.
    const failAll = async (msg: string) => {
      for (const { runId, agent } of jobs) {
        await this.repo
          .completeAgentRun(runId, {
            status: 'failed',
            durationMs: 0,
            tokensIn: 0,
            tokensOut: 0,
            costUsd: null,
            findingsCount: 0,
            grounding: '0/0 passed',
            error: msg,
          })
          .catch(() => undefined);
        await this.repo
          .saveRunTrace(runId, this.traceFromBuffer(runId, pull, agent, '0/0 passed'))
          .catch(() => undefined);
        this.deps.runBus.complete(runId);
      }
    };

    let diff: UnifiedDiff;
    try {
      diff = await runLog.step('Loading PR diff', () => loadDiff(this.deps.git, this.repo, workspaceId, pull, repo), {
        kind: 'tool',
      });
    } catch (err) {
      runLog.error(`Failed to load PR diff: ${(err as Error).message}`);
      await failAll(`Failed to load PR diff: ${(err as Error).message}`);
      return;
    }
    runLog.info(`Diff ready — ${diff.files.length} changed file(s); starting ${jobs.length} agent run(s)`);

    // L03 — resolve PR intent ONCE per run batch (not per agent), right after
    // the diff load, exactly as this class's own docstring has always framed
    // it. Best-effort: any failure here degrades the prompt back to the
    // pre-L03 baseline (reviewPullRequest omits the `intent` slot when
    // undefined) — unlike a diff-load failure, it never fails the queued runs.
    let resolvedIntent: string | undefined;
    let resolvedInScope: string[] | undefined;
    let resolvedOutOfScope: string[] | undefined;
    try {
      const intent = await runLog.step(
        'Resolving PR intent',
        () =>
          this.deps.resolveIntent({
            workspaceId,
            pull: { id: pull.id, title: pull.title, body: pull.body },
            repo: { owner: repo.owner, name: repo.name, clonePath: repo.clonePath },
            diffFiles: diff.files.map((f) => ({
              path: f.path,
              hunks: f.hunks.map((h) => ({
                oldStart: h.oldStart,
                oldLines: h.oldLines,
                newStart: h.newStart,
                newLines: h.newLines,
              })),
            })),
            onSignal: (msg) => runLog.info(msg),
          }),
        { kind: 'tool' },
      );
      resolvedIntent = intent.rendered;
      resolvedInScope = intent.inScope;
      resolvedOutOfScope = intent.outOfScope;
      logger?.info(
        {
          prId: pull.id,
          provider: intent.provider ?? null,
          model: intent.model ?? null,
          promptTokensEstimate: intent.userMessageText
            ? this.deps.tokenizer.count(intent.userMessageText)
            : null,
          inScope: intent.inScope?.length ?? 0,
          outOfScope: intent.outOfScope?.length ?? 0,
          contextGaps: intent.contextGaps?.length ?? 0,
        },
        'review: intent resolved',
      );
    } catch (err) {
      runLog.info(`intent: resolution failed — ${(err as Error).message}`);
    }

    // specs/13-multi-agent-review.md (D16) — the per-agent job loop runs
    // concurrently rather than sequentially. `Promise.allSettled`, not
    // `Promise.all`: the body already swallows its own errors (try/catch
    // below), so nothing should reject — but `allSettled` makes "one job
    // cannot abort the batch" (AC-17) structural rather than dependent on
    // that. Everything inside one iteration is unchanged and reads only
    // values computed before this loop and never mutated by it; nothing in
    // one iteration reads another's outcome. See server/LEARNINGS.md for the
    // provider-throttling note this change entails.
    await Promise.allSettled(
      jobs.map(async ({ agent, runId }) => {
        const agentStart = Date.now();
        logger?.info(
          { runId, agent: agent.name, provider: agent.provider, model: agent.model, prId: pull.id },
          `review: agent "${agent.name}" started (${agent.provider}/${agent.model})`,
        );
        try {
          const outcome = await this.runOneAgent(
            workspaceId,
            pull,
            repo,
            diff,
            agent,
            runId,
            runLog,
            resolvedIntent,
            resolvedInScope,
            resolvedOutOfScope,
            logger,
          );
          logger?.info(
            {
              runId,
              agent: agent.name,
              findings: outcome.findings.length,
              grounding: outcome.grounding,
              durationMs: Date.now() - agentStart,
            },
            `review: agent "${agent.name}" done — ${outcome.findings.length} finding(s)`,
          );
        } catch (err) {
          // runOneAgent already persisted the failure/cancel (status + error +
          // trace) and completed the bus; here we only log at the run level.
          const cancelled = err instanceof RunCancelledError;
          logger?.[cancelled ? 'info' : 'error'](
            { runId, agent: agent.name, err: (err as Error).message, durationMs: Date.now() - agentStart },
            `review: agent "${agent.name}" ${cancelled ? 'cancelled' : 'failed'}`,
          );
        }
      }),
    );
  }

  /** Execute a single agent's review against a PR, streaming progress. */
  private async runOneAgent(
    workspaceId: string,
    pull: PullRow,
    repo: RunRepoRow,
    diff: UnifiedDiff,
    agent: RunAgent,
    runId: string,
    parentLog: RunLogger,
    /** L03 — the already-resolved intent string (resolved once per run batch
     *  in `executeRuns`, not here). `undefined` when resolution was skipped/
     *  failed — reviewPullRequest omits the slot in that case. */
    resolvedIntent?: string,
    /** Revision 2 (specs/05-intent-layer.md) — the already-resolved structured
     *  scope, alongside `resolvedIntent`. Same omit-when-undefined contract. */
    resolvedInScope?: string[],
    resolvedOutOfScope?: string[],
    logger?: Logger,
  ): Promise<RunOutcome> {
    const start = Date.now();
    // Narrow the fanned-out pre-work logger to THIS run; the shared diff/intent
    // events are already in this run's buffer, so the persisted trace below
    // (built from the buffer) includes them too.
    const runLog = parentLog.forRun(runId, { agent: agent.name });

    runLog.info(`Starting review with agent "${agent.name}" (${agent.provider}/${agent.model})`);

    try {
      // Resolve the agent's LLM provider. (container.llm throws if the provider
      // key is missing — caught below and persisted as a failed run.)
      const llm = await runLog.step(
        `Resolving ${agent.provider} provider`,
        () => this.deps.llm(agent.provider as Provider),
        { kind: 'tool' },
      );

      // Per-agent repo-intel toggle (Agent editor). When an agent opts out we
      // skip all enrichment entirely so its prompt is identical to the
      // repo-intel-off baseline — independent of the global REPO_INTEL_ENABLED
      // flag, which still gates the facade internally.
      const repoIntelOn = agent.repoIntel !== false;
      if (!repoIntelOn) runLog.info('Repo intel disabled for this agent — skipping context enrichment');

      // T1.3 — callers-in-prompt. Best-effort: when repo-intel is off the facade
      // returns []; we omit the section and behavior is identical to the
      // pre-T1.3 prompt (acceptance #10).
      const callersDigest = repoIntelOn
        ? await this.buildCallersDigest(pull.repoId, diff, runLog)
        : undefined;

      // T3 — repo skeleton + "changed files are top-5%" framing. Both best-
      // effort: when repo-intel is off / unindexed the facade degrades and the
      // prompt is identical to the pre-T3 shape.
      const repoMap = repoIntelOn ? await this.buildRepoMapDigest(pull.repoId, runLog) : undefined;
      const rankNote = repoIntelOn ? await this.buildRankNote(pull.repoId, diff, runLog) : '';

      const task = taskLine(pull) + rankNote;

      // L02 — skills into the prompt. Resolve the agent's enabled skills, in
      // link order, into prompt blocks. BOTH gates must pass: the skill is
      // active in the workspace (vetted) AND enabled on this agent.
      const linkedSkills = await runLog.step(
        'Loading skills',
        () => this.deps.agents.enabledSkills(agent.id),
        { kind: 'tool' },
      );
      // ONE renderer, shared with GET /skills/:id/preview — if this ever
      // formats differently from `renderSkillBlock`, the Preview tab is lying
      // about what the model actually receives.
      const skillBlocks = linkedSkills.map(renderSkillBlock);
      if (linkedSkills.length > 0) {
        runLog.info(
          `Loaded ${linkedSkills.length} skill(s): ${linkedSkills.map((s) => s.name).join(', ')}`,
        );
      }

      // specs/09-project-context-folder.md — resolve agent-direct + enabled-
      // skill-inherited documents, deduped, budgeted, read from the repo's
      // SYNCED DEFAULT-BRANCH checkout (never the PR branch head — D4/AC-14).
      // repoId is always known on this (PR-triggered) path, so a document
      // pinned to a different repo is dropped with `repo_mismatch` (AC-33).
      const projectContext = await runLog.step(
        'Loading project context',
        () => this.deps.resolveProjectContext(workspaceId, agent.id, pull.repoId),
        { kind: 'tool' },
      );
      const specsRead: RunTrace['specs_read'] = projectContext.entries.map((e) => ({
        path: e.path,
        tokens: e.tokens,
        origin: e.origin,
        skill: e.skill,
        status: e.status,
        reason: e.reason,
      }));
      const includedTokens = specsRead
        .filter((e) => e.status === 'included')
        .reduce((sum, e) => sum + e.tokens, 0);
      const omittedCount = specsRead.filter((e) => e.status !== 'included').length;
      if (specsRead.length > 0) {
        runLog.info(
          `Project context: ${projectContext.documents.length} document(s), ` +
            `${includedTokens} token(s); ${omittedCount} omitted`,
        );
      }

      // ---- Engine: assemble → single-pass → grounding -----------------------
      // The pure review pipeline lives in @devdigest/reviewer-core (shared with
      // the CI runner). The service owns only I/O: repo-intel context resolution
      // above, and persistence + observability below.
      const outcome = await reviewPullRequest({
        systemPrompt: agent.systemPrompt,
        model: agent.model,
        diff,
        llm,
        // Per-agent review strategy (configured in the Agent editor); falls back
        // to the studio default. single-pass = whole diff in one call.
        strategy: agent.strategy ?? REVIEW_STRATEGY,
        // L02 — linked skill BODIES (not slugs), in link order. Omit-when-empty:
        // an agent with zero enabled skills produces a prompt byte-identical to
        // the pre-skills baseline, with PromptAssembly.skills === null.
        ...(skillBlocks.length > 0 ? { skills: skillBlocks } : {}),
        // T1.3 — pass the callers digest only when we built one. assemblePrompt
        // omits the section when this is empty/undefined.
        ...(callersDigest ? { callers: callersDigest } : {}),
        // T3 — repo skeleton, same omit-when-empty contract.
        ...(repoMap ? { repoMap } : {}),
        // PR author's description/body — untrusted; assemblePrompt wraps +
        // truncates it. Omitted when the PR has no body.
        ...(pull.body ? { prDescription: pull.body } : {}),
        // L03 — derived PR intent, resolved once per run batch. Omit-when-
        // empty: a skipped/failed resolution produces a prompt identical to
        // the pre-L03 baseline.
        ...(resolvedIntent ? { intent: resolvedIntent } : {}),
        // Revision 2 (specs/05-intent-layer.md) — structured declared scope,
        // alongside the free-text intent summary above. Same omit-when-empty
        // contract.
        ...(resolvedInScope?.length ? { intentInScope: resolvedInScope } : {}),
        ...(resolvedOutOfScope?.length ? { intentOutOfScope: resolvedOutOfScope } : {}),
        // specs/09 — resolved project-context documents. Omit-when-empty:
        // zero attached/inherited documents produces a prompt byte-identical
        // to the pre-feature baseline (AC-16).
        ...(projectContext.documents.length > 0 ? { specs: projectContext.documents } : {}),
        task,
        sessionId: `${repo.owner}/${repo.name}#${pull.number}:${agent.name}`,
        onEvent: (e) => runLog.event(e.kind, e.msg, e.data),
        checkCancelled: () => {
          if (this.deps.runBus.isCancelled(runId)) throw new RunCancelledError();
        },
      });
      const { tokensIn, tokensOut, costUsd, grounding } = outcome;

      // Local-only, metadata-only prompt-assembly log (PROMPT_ASSEMBLY_DEBUG).
      // Goes straight to the structured stdout logger — deliberately NOT through
      // `runLog`, which fans out to the SSE Live Log every viewer of this run
      // can see; this data is for local debugging only. Section CONTENT is
      // never included (see promptAssemblySections's contract), only name,
      // origin, and char length, alongside the model and runId (correlation).
      if (this.deps.promptAssemblyDebugEnabled) {
        logger?.debug(
          {
            runId,
            prId: pull.id,
            agent: agent.name,
            provider: agent.provider,
            model: agent.model,
            mode: outcome.mode,
            sections: promptAssemblySections(outcome.assembly, diff.raw.length),
          },
          'review: prompt assembled (debug)',
        );
      }

      // One row per injected skill — the Stats tab's only source of truth, and
      // the reason it can say "this skill was pulled into 71% of runs" after the
      // links have since been toggled. Tokenized with the SAME counter the skill
      // editor uses (container.tokenizer), never an estimate, so the number in
      // the editor and the number in Stats can't disagree.
      // Best-effort, like the other observability writes: never fail a review
      // that already produced findings because a metrics row didn't land.
      if (linkedSkills.length > 0) {
        await this.repo
          .recordRunSkills(
            runId,
            linkedSkills.map((s, i) => ({
              skillId: s.id,
              order: i,
              tokens: this.deps.tokenizer.count(skillBlocks[i]!),
            })),
          )
          .catch(() => undefined);
      }

      const keptFindings = outcome.review.findings;

      // The model is done: close the Live Log stream now so the UI drops the
      // spinner as early as possible. What follows is bookkeeping (rows +
      // trace) that no viewer needs to wait on.
      runLog.info('Run complete');
      this.deps.runBus.complete(runId);

      // ---- Persist review + findings ----------------------------------------
      const review = await this.repo.insertReview({
        workspaceId,
        prId: pull.id,
        agentId: agent.id,
        runId,
        kind: 'review',
        verdict: outcome.review.verdict,
        summary: outcome.review.summary,
        score: outcome.review.score,
        model: agent.model,
      });
      const findingRows = await this.repo.insertFindings(review.id, keptFindings);
      runLog.result(`Persisted review ${review.id} with ${findingRows.length} finding(s)`);

      // Mark the commit this review ran against so the PR list can tell
      // reviewed / needs-review (head moved) / stale apart.
      await this.repo.markReviewed(pull.id, pull.headSha);

      const durationMs = Date.now() - start;

      // Deterministic blocker count (severity ≥ the agent's gate) — the signal
      // the timeline colors on, NOT the model's self-reported verdict.
      const blockers = countBlockers(keptFindings, agent.ciFailOn);

      // ---- Observability: agent_runs + ONE run_traces document --------------
      await this.repo.completeAgentRun(runId, {
        status: 'done',
        durationMs,
        tokensIn,
        tokensOut,
        costUsd,
        findingsCount: findingRows.length,
        grounding,
        score: outcome.review.score,
        blockers,
        error: null,
      });

      const trace = buildTrace({
        agent,
        prNumber: pull.number,
        durationMs,
        tokensIn,
        tokensOut,
        costUsd,
        findingsCount: findingRows.length,
        grounding,
        assembly: outcome.assembly,
        chunks: outcome.chunks,
        mode: outcome.mode,
        raw: outcome.raw,
        specsRead,
        // Persisted log = the run's FULL event buffer (incl. shared pre-work:
        // diff load + intent), not just events recorded inside this method.
        log: runLog.logFor(runId),
      });
      await this.repo.saveRunTrace(runId, trace);

      return { review, findings: findingRows, grounding, raw: outcome.review };
    } catch (err) {
      // Failure/cancel: persist status + the error text + the log-so-far so the
      // run (and WHY it failed) is visible on the UI after a reload.
      const cancelled = err instanceof RunCancelledError;
      const status = cancelled ? 'cancelled' : 'failed';
      const msg = cancelled ? 'Cancelled by user' : (err as Error).message;
      runLog.error(cancelled ? 'Run cancelled by user' : `Run failed: ${msg}`);
      await this.repo
        .completeAgentRun(runId, {
          status,
          durationMs: Date.now() - start,
          tokensIn: 0,
          tokensOut: 0,
          costUsd: null,
          findingsCount: 0,
          grounding: '0/0 passed',
          error: msg,
        })
        .catch(() => undefined);
      await this.repo
        .saveRunTrace(runId, this.traceFromBuffer(runId, pull, agent, '0/0 passed', Date.now() - start))
        .catch(() => undefined);
      this.deps.runBus.complete(runId);
      throw err;
    }
  }

  /**
   * Build a compact "Callers of changed symbols" digest for the prompt.
   *
   * Returns `undefined` when nothing should be added (flag off, no callers
   * found, or repo-intel errors) — `reviewPullRequest` omits the section in
   * that case (acceptance #10: flag off → identical prompt).
   *
   * Compact format: one bullet per caller, grouped by file. Trimmed (limit 10
   * rows per `getCallerSignatures` call) so the section stays under ~600
   * tokens even on heavy PRs.
   */
  private async buildCallersDigest(
    repoId: string,
    diff: UnifiedDiff,
    runLog: RunLogger,
  ): Promise<string | undefined> {
    const changedFiles = diff.files.map((f) => f.path);
    if (changedFiles.length === 0) return undefined;
    let rows;
    try {
      rows = await this.deps.repoIntel.getCallerSignatures(
        repoId,
        changedFiles,
        10,
        hunkRangesByFile(diff),
      );
    } catch (err) {
      // Never let an enrichment break the run — surface only as a Live Log info.
      runLog.info(`callers digest: repoIntel failed — ${(err as Error).message}`);
      return undefined;
    }
    if (rows.length === 0) return undefined;

    runLog.info(`callers digest: ${rows.length} caller signature(s) attached`);
    return renderCallersDigest(rows);
  }

  /**
   * T3 — fetch the cached repo skeleton for the prompt's `## Repo skeleton`
   * slot. Returns `undefined` when repo-intel is off / the repo isn't indexed
   * (the facade degrades), so the prompt stays identical to the pre-T3 shape.
   */
  private async buildRepoMapDigest(
    repoId: string,
    runLog: RunLogger,
  ): Promise<string | undefined> {
    try {
      const map = await this.deps.repoIntel.getRepoMap(repoId);
      if (map.degraded || map.text.trim().length === 0) return undefined;
      runLog.info(`repo map: ${map.tokens} token(s) attached (cached=${map.cached})`);
      return map.text;
    } catch (err) {
      runLog.info(`repo map: repoIntel failed — ${(err as Error).message}`);
      return undefined;
    }
  }

  /**
   * T3 — a one-line "N of M changed files are in the top 5% most-depended-on"
   * note appended to the task framing, so the model prioritises hot core files.
   * Empty string when repo-intel is off / no changed file is hot.
   */
  private async buildRankNote(
    repoId: string,
    diff: UnifiedDiff,
    runLog: RunLogger,
  ): Promise<string> {
    const changedFiles = diff.files.map((f) => f.path);
    if (changedFiles.length === 0) return '';
    try {
      const ranks = await this.deps.repoIntel.getFileRank(repoId, changedFiles);
      if (ranks.length === 0) return '';
      const { note, hotCount } = rankNote(ranks, changedFiles.length);
      if (hotCount === 0) return '';
      runLog.info(`file rank: ${hotCount}/${changedFiles.length} changed file(s) in top 5%`);
      return note;
    } catch {
      return '';
    }
  }

  /**
   * A minimal RunTrace whose `log` is the run's full SSE buffer — persisted on
   * failure/cancel (and pre-work failures) so the events (and WHY it failed)
   * survive a reload, not just the in-memory stream.
   */
  private traceFromBuffer(
    runId: string,
    pull: PullRow,
    agent: RunAgent,
    grounding: string,
    durationMs = 0,
  ): RunTrace {
    return buildFallbackTrace({
      agent,
      prNumber: pull.number,
      grounding,
      durationMs,
      log: this.deps.runBus.buffer(runId).map((e) => ({ t: e.t, kind: e.kind, msg: e.msg })),
    });
  }
}

/**
 * OLD-side hunk ranges per file for the callers digest: the persisted index
 * stores symbol spans in BASE coordinates, so a head-side shift (+N lines
 * above) must not move the match. `@@ -a,b @@` ⇒ a…a+b-1; an addition-only
 * hunk (b = 0) is the insertion point `a` as a 1-line range, so code added
 * inside an existing function marks that function changed.
 */
export function hunkRangesByFile(diff: UnifiedDiff): Map<string, Array<{ start: number; end: number }>> {
  const out = new Map<string, Array<{ start: number; end: number }>>();
  for (const f of diff.files) {
    const ranges = f.hunks.map((h) => ({
      start: h.oldStart,
      end: h.oldLines > 0 ? h.oldStart + h.oldLines - 1 : h.oldStart,
    }));
    if (ranges.length > 0) out.set(f.path, ranges);
  }
  return out;
}
