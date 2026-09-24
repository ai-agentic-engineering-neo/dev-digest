import type { Intent, IntentTrace, UnifiedDiff } from '@devdigest/shared';
import { reviewPullRequest, countBlockers, estimateTokens, type ReviewOutcome } from '@devdigest/reviewer-core';
import type { PromptLogPort } from '../../../platform/prompt-log.js';
import { RunLogger } from '../../../platform/run-logger.js';
import { renderSkillBlock } from '../../skills/index.js';
import type { RunBus } from '../../../platform/sse.js';
import { NO_GROUNDING, REVIEW_STRATEGY } from '../domain/constants.js';
import { taskLine } from '../domain/prompt.js';
import { RunCancelledError, runEnding } from '../domain/run.js';
import { skillIdsByName, skillsLogLine, skillsUsed } from '../domain/skills.js';
import { completedRunTrace, endedRunTrace } from '../domain/trace.js';
import type { ReviewAgent, ReviewPull, ReviewRepo, ReviewSkill } from '../domain/types.js';
import { UsageMeter } from '../domain/usage-meter.js';
import { loadDiff } from './diff-loader.js';
import { resolveIntentPrework } from './intent-prework.js';
import type {
  AgentSkillsReader,
  Clock,
  DiffSource,
  IntentResolver,
  LlmResolver,
  Logger,
  RepoContext,
  ReviewStore,
  ReviewTx,
} from './ports.js';
import { gatherPromptContext } from './prompt-context.js';

export interface RunExecutorDeps {
  reviews: ReviewStore;
  /** Persist step of a run (review + findings + terminal status) in one transaction. */
  tx: ReviewTx;
  runBus: RunBus;
  llm: LlmResolver;
  git: DiffSource;
  repoIntel: RepoContext;
  /** The agent's linked + enabled skills (injected into the prompt). */
  skills: AgentSkillsReader;
  clock: Clock;
  /** Max map-reduce chunks in flight; undefined = reviewer-core's default. */
  mapConcurrency?: number;
  /** Intent layer (server/specs/05-intent-layer.md); undefined = kill switch off. */
  intent?: IntentResolver;
  /** Structured, content-free prompt-assembly logging (platform/prompt-log.ts); undefined = no-op. */
  promptLog?: PromptLogPort;
}

export interface RunJob {
  agent: ReviewAgent;
  runId: string;
}

/**
 * Background execution of queued agent runs. Loads the diff once, then runs
 * each agent through the reviewer-core engine, streaming events over the
 * RunBus and persisting each review. Per-agent failures are isolated.
 *
 * Cancel (RunBus.cancel) aborts the run's AbortController: the signal reaches
 * every in-flight LLM call (map chunks running in parallel included), and the
 * engine's `checkCancelled` checkpoint keeps chunks that have not started yet
 * from starting.
 */
export class ReviewRunExecutor {
  constructor(private readonly deps: RunExecutorDeps) {}

  private now(): number {
    return this.deps.clock().getTime();
  }

  /** NOT awaited by the route: the POST answers with the runIds right away. */
  async executeRuns(
    workspaceId: string,
    pull: ReviewPull,
    repo: ReviewRepo,
    jobs: RunJob[],
    logger?: Logger,
  ): Promise<void> {
    // ONE logger fanned out over every queued run: shared pre-work (the diff)
    // lands in each run's Live Log and trace. Per-agent work narrows it.
    const runLog = new RunLogger(this.deps.runBus, jobs.map((j) => j.runId), logger, { prId: pull.id });

    let diff: UnifiedDiff;
    try {
      diff = await runLog.step('Loading PR diff', () => loadDiff(this.deps, pull, repo), { kind: 'tool' });
    } catch (err) {
      const msg = `Failed to load PR diff: ${(err as Error).message}`;
      runLog.error(msg);
      await this.failAll(jobs, pull, msg);
      return;
    }
    runLog.info(`Diff ready — ${diff.files.length} changed file(s); starting ${jobs.length} agent run(s)`);

    // Shared pre-work (server/specs/05-intent-layer.md): derived/cached ONCE
    // for this request, fanned out to every queued run's prompt/log/trace.
    // Never throws — a failure degrades to {} (every run proceeds with no intent).
    // The batch-level signal aborts derivation only once EVERY queued run has
    // been cancelled — a single run's cancel must not starve the others still
    // waiting on this shared pre-work.
    const intentAbort = new AbortController();
    const cancelledForIntent = new Set<string>();
    const offIntentCancels = jobs.map(({ runId }) =>
      this.deps.runBus.onCancel(runId, () => {
        cancelledForIntent.add(runId);
        if (cancelledForIntent.size >= jobs.length) intentAbort.abort();
      }),
    );
    let intent: Intent | undefined;
    let intentTrace: IntentTrace | undefined;
    try {
      ({ intent, intentTrace } = await resolveIntentPrework(
        this.deps.intent,
        workspaceId,
        pull,
        repo,
        diff,
        (kind, msg, data) => runLog.event(kind, msg, data),
        intentAbort.signal,
      ));
    } finally {
      for (const off of offIntentCancels) off();
    }

    for (const { agent, runId } of jobs) {
      const agentStart = this.now();
      logger?.info(
        { runId, agent: agent.name, provider: agent.provider, model: agent.model, prId: pull.id },
        `review: agent "${agent.name}" started (${agent.provider}/${agent.model})`,
      );
      try {
        const findings = await this.runOneAgent(workspaceId, pull, repo, diff, agent, runId, runLog, intent, intentTrace);
        logger?.info(
          { runId, agent: agent.name, findings, durationMs: this.now() - agentStart },
          `review: agent "${agent.name}" done — ${findings} finding(s)`,
        );
      } catch (err) {
        // runOneAgent already persisted the failure/cancel and completed the bus.
        const cancelled = err instanceof RunCancelledError;
        logger?.[cancelled ? 'info' : 'error'](
          { runId, agent: agent.name, err: (err as Error).message, durationMs: this.now() - agentStart },
          `review: agent "${agent.name}" ${cancelled ? 'cancelled' : 'failed'}`,
        );
      }
    }
  }

  /** A pre-work failure (e.g. diff load) fails EVERY queued run; the error is already in each buffer. */
  private async failAll(jobs: RunJob[], pull: ReviewPull, msg: string): Promise<void> {
    for (const { runId, agent } of jobs) {
      await this.deps.reviews
        .failAgentRun(runId, 'failed', {
          durationMs: 0,
          tokensIn: 0,
          tokensOut: 0,
          costUsd: 0, // no LLM call was made ⇒ nothing billed
          findingsCount: 0,
          grounding: NO_GROUNDING,
          error: msg,
        })
        .catch(() => undefined);
      await this.deps.reviews
        .saveRunTrace(runId, endedRunTrace({ agent, prNumber: pull.number, log: this.bufferedLog(runId) }))
        .catch(() => undefined);
      this.deps.runBus.complete(runId);
    }
  }

  /** One agent's review of a PR; returns the number of persisted findings. */
  private async runOneAgent(
    workspaceId: string,
    pull: ReviewPull,
    repo: ReviewRepo,
    diff: UnifiedDiff,
    agent: ReviewAgent,
    runId: string,
    parentLog: RunLogger,
    intent: Intent | undefined,
    intentTrace: IntentTrace | undefined,
  ): Promise<number> {
    const start = this.now();
    const runLog = parentLog.forRun(runId, { agent: agent.name });
    // Every LLM response's usage as it arrives — the only record of spend when
    // the run fails or is cancelled (the engine's outcome is lost with the throw).
    const usage = new UsageMeter();
    // Cancel aborts the in-flight LLM call(s), not just the next checkpoint.
    const abort = new AbortController();
    const bus = this.deps.runBus;
    const offCancel = bus.onCancel(runId, () => abort.abort());
    const isCancelled = () => abort.signal.aborted || bus.isCancelled(runId);

    runLog.info(`Starting review with agent "${agent.name}" (${agent.provider}/${agent.model})`);
    let skills: ReviewSkill[] = [];
    try {
      skills = await this.attachSkills(agent, runId, runLog);
      const outcome = await this.review(pull, repo, diff, agent, skills, runLog, usage, abort.signal, isCancelled, intent, runId);
      // Last in-memory checkpoint: a cancel that arrived DURING the final LLM
      // call must still win. A later one is caught by the conditional status
      // update inside the persist transaction.
      if (isCancelled()) throw new RunCancelledError();
      const { reviewId, findings, durationMs } = await this.persist(
        workspaceId,
        pull,
        agent,
        runId,
        outcome,
        start,
        skillIdsByName(skills),
      );
      runLog.result(`Persisted review ${reviewId} with ${findings} finding(s)`);
      const trace = completedRunTrace({
        agent,
        prNumber: pull.number,
        durationMs,
        usage: outcome,
        findings,
        grounding: outcome.grounding,
        assembly: outcome.assembly,
        chunks: outcome.chunks,
        mode: outcome.mode,
        raw: outcome.raw,
        // The run's FULL event buffer (incl. the shared diff pre-work).
        log: runLog.logFor(runId),
        skillsUsed: skillsUsed(skills),
        intent: intentTrace,
      });
      runLog.info('Run complete; trace persisted');
      await this.deps.reviews.saveRunTrace(runId, trace);
      bus.complete(runId);
      return findings;
    } catch (err) {
      const cancelled = isCancelled();
      await this.recordEnd(err, cancelled, runId, pull, agent, runLog, start, usage, skills, intentTrace);
      // An error raised by an aborted LLM call is reported as the cancel it is.
      throw cancelled && !(err instanceof RunCancelledError) ? new RunCancelledError() : err;
    } finally {
      offCancel();
    }
  }

  /**
   * Load the agent's linked, enabled skills (link order), record them on the
   * run (agent_run_skills, exact versions) and log what the prompt carries.
   */
  private async attachSkills(agent: ReviewAgent, runId: string, runLog: RunLogger): Promise<ReviewSkill[]> {
    const skills = await this.deps.skills.enabledForAgent(agent.id);
    if (skills.length === 0) return skills;
    await this.deps.reviews.recordRunSkills(runId, skills);
    const tokens = estimateTokens(skills.map(renderSkillBlock).join('\n\n'));
    runLog.info(skillsLogLine(skills, tokens, (agent.strategy ?? REVIEW_STRATEGY) !== 'single-pass'), {
      skills: skillsUsed(skills),
    });
    return skills;
  }

  /** Resolve the provider, gather prompt context and run the engine. */
  private async review(
    pull: ReviewPull,
    repo: ReviewRepo,
    diff: UnifiedDiff,
    agent: ReviewAgent,
    skills: readonly ReviewSkill[],
    runLog: RunLogger,
    usage: UsageMeter,
    signal: AbortSignal,
    isCancelled: () => boolean,
    intent: Intent | undefined,
    runId: string,
  ): Promise<ReviewOutcome> {
    // Throws when the provider key is missing → persisted as a failed run.
    const llm = await runLog.step(`Resolving ${agent.provider} provider`, () => this.deps.llm(agent.provider), {
      kind: 'tool',
    });
    // Per-agent repo-intel toggle: an opted-out agent gets the diff-only prompt.
    const repoIntelOn = agent.repoIntel !== false;
    if (!repoIntelOn) runLog.info('Repo intel disabled for this agent — skipping context enrichment');
    const ctx = repoIntelOn
      ? await gatherPromptContext(this.deps.repoIntel, pull.repoId, diff, runLog)
      : { rankNote: '' };
    const concurrency = this.deps.mapConcurrency;

    return reviewPullRequest({
      systemPrompt: agent.systemPrompt,
      model: agent.model,
      diff,
      llm,
      strategy: agent.strategy ?? REVIEW_STRATEGY,
      ...(concurrency !== undefined ? { concurrency } : {}),
      ...(ctx.callers ? { callers: ctx.callers } : {}),
      ...(ctx.repoMap ? { repoMap: ctx.repoMap } : {}),
      // Zero skills → the key is absent → the prompt is byte-identical to before.
      ...(skills.length > 0 ? { skills: skills.map(renderSkillBlock) } : {}),
      // PR author's body — untrusted; the engine wraps + truncates it.
      ...(pull.body ? { prDescription: pull.body } : {}),
      // Derived PR intent (server/specs/05-intent-layer.md); undefined → the
      // `## PR intent` section is omitted, prompt byte-identical to before.
      ...(intent ? { intent } : {}),
      task: taskLine(pull) + ctx.rankNote,
      sessionId: `${repo.owner}/${repo.name}#${pull.number}:${agent.name}`,
      onEvent: (e) => runLog.event(e.kind, e.msg, e.data),
      onUsage: usage.add,
      onPrompt: (e) =>
        this.deps.promptLog?.assembled({
          feature: 'review',
          correlationId: runId,
          provider: agent.provider,
          model: agent.model,
          chunk: { index: e.chunkIndex, total: e.chunkCount },
          sections: e.sections,
          verbose: { chunkLabel: e.chunkLabel },
        }),
      signal,
      checkCancelled: () => {
        if (isCancelled()) throw new RunCancelledError();
      },
    });
  }

  /**
   * Review + findings + PR freshness + terminal status in ONE transaction.
   * 'done' is written only from 'running': 0 rows ⇒ a cancel landed after the
   * last checkpoint ⇒ throw to roll the review back; the run stays cancelled.
   */
  private persist(
    workspaceId: string,
    pull: ReviewPull,
    agent: ReviewAgent,
    runId: string,
    outcome: ReviewOutcome,
    start: number,
    skillIds: ReadonlyMap<string, string>,
  ): Promise<{ reviewId: string; findings: number; durationMs: number }> {
    const kept = outcome.review.findings;
    // Deterministic blocker count (severity ≥ the agent's gate), not the model's verdict.
    const blockers = countBlockers(kept, agent.ciFailOn);
    return this.deps.tx.run(async ({ reviews }) => {
      const review = await reviews.insertReview({
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
      const findings = await reviews.insertFindings(review.id, kept, skillIds);
      await reviews.markReviewed(pull.id, pull.headSha);
      const durationMs = this.now() - start;
      const completed = await reviews.completeAgentRunIfRunning(runId, {
        durationMs,
        tokensIn: outcome.tokensIn,
        tokensOut: outcome.tokensOut,
        costUsd: outcome.costUsd,
        findingsCount: findings.length,
        grounding: outcome.grounding,
        score: outcome.review.score,
        blockers,
        error: null,
      });
      if (!completed) throw new RunCancelledError();
      return { reviewId: review.id, findings: findings.length, durationMs };
    });
  }

  /**
   * Failure/cancel: persist the status, the reason, the usage spent so far and
   * the log-so-far, so the run (and WHY it ended) survives a reload.
   */
  private async recordEnd(
    err: unknown,
    cancelled: boolean,
    runId: string,
    pull: ReviewPull,
    agent: ReviewAgent,
    runLog: RunLogger,
    start: number,
    usage: UsageMeter,
    skills: readonly ReviewSkill[],
    intentTrace: IntentTrace | undefined,
  ): Promise<void> {
    const { status, note } = runEnding(err, cancelled);
    runLog.error(status === 'cancelled' ? 'Run cancelled by user' : `Run failed: ${note}`);
    const durationMs = this.now() - start;
    await this.deps.reviews
      .failAgentRun(runId, status, {
        durationMs,
        tokensIn: usage.tokensIn,
        tokensOut: usage.tokensOut,
        costUsd: usage.costUsd,
        findingsCount: 0,
        grounding: NO_GROUNDING,
        error: note,
      })
      .catch(() => undefined);
    await this.deps.reviews
      .saveRunTrace(
        runId,
        endedRunTrace({
          agent,
          prNumber: pull.number,
          log: this.bufferedLog(runId),
          durationMs,
          usage,
          skillsUsed: skillsUsed(skills),
          intent: intentTrace,
        }),
      )
      .catch(() => undefined);
    this.deps.runBus.complete(runId);
  }

  private bufferedLog(runId: string) {
    return this.deps.runBus.buffer(runId).map((e) => ({ t: e.t, kind: e.kind, msg: e.msg }));
  }
}
