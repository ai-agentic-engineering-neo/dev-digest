import type { Agent, LlmUsage, Review, RunTrace, UnifiedDiff } from '@devdigest/shared';
import {
  reviewPullRequest,
  countBlockers,
  formatSkills,
  StructuredOutputError,
} from '@devdigest/reviewer-core';
import { RunLogger } from '../../platform/run-logger.js';
import { MAX_DIFF_CHARS, REVIEW_MAX_OUTPUT_TOKENS, REVIEW_STRATEGY } from './constants.js';
import { RunCancelledError, capDiff, skillsLogLine, taskLine } from './domain.js';
import { loadDiff } from './diff-loader.js';
import type {
  AgentSkills,
  DiffParser,
  DiffSource,
  LlmResolver,
  Logger,
  PullAccess,
  RepoContext,
  RepoRef,
  ReviewPull,
  ReviewStore,
  RunEvents,
  TokenCounter,
} from './ports.js';

// A reduced "Review per file" — same schema as Review (the model returns a small
// Review per file; we merge findings + take the worst verdict / mean score).
export type RunOutcome = {
  reviewId: string;
  findingsCount: number;
  grounding: string;
  raw: Review;
};

export interface RunExecutorDeps {
  store: ReviewStore;
  pulls: PullAccess;
  llm: LlmResolver;
  git: DiffSource;
  parseDiff: DiffParser;
  repoIntel: RepoContext;
  events: RunEvents;
  /** Effective skills of an agent (M2). */
  skills: AgentSkills;
  /** Counts the skills block's tokens for the trace. */
  tokens: TokenCounter;
}

/**
 * Owns the background execution of queued agent runs. Loads the diff once,
 * then runs each agent, streaming events over the run bus and persisting each
 * review. Per-agent failures are isolated.
 */
export class ReviewRunExecutor {
  constructor(private deps: RunExecutorDeps) {}

  /**
   * Background execution of the queued agent runs (NOT awaited by the route).
   * Loads the diff + intent once, then map-reduces each agent, streaming events
   * over the runBus and persisting each review. Per-agent failures are isolated.
   */
  async executeRuns(
    workspaceId: string,
    pull: ReviewPull,
    repo: RepoRef,
    jobs: { agent: Agent; runId: string }[],
    logger?: Logger,
  ): Promise<void> {
    // ONE logger fanned out over every queued run: shared pre-work (diff +
    // intent) is streamed into each target agent's Live Log and persisted into
    // each run's trace. Per-agent work below narrows it to a single run.
    const runLog = new RunLogger(
      this.deps.events,
      jobs.map((j) => j.runId),
      logger,
      { prId: pull.id },
    );

    // Pre-work failure (e.g. diff load) fails EVERY queued run. The error was
    // already emitted via runLog (fanned out → in each run's buffer); here we
    // mark the rows failed and persist the buffered log so it survives a reload.
    const failAll = async (msg: string) => {
      for (const { runId, agent } of jobs) {
        await this.deps.store
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
        await this.deps.store
          .saveRunTrace(runId, this.traceFromBuffer(runId, pull, agent, '0/0 passed'))
          .catch(() => undefined);
        this.deps.events.complete(runId);
        this.deps.events.clearCancelled(runId);
      }
    };

    let diff: UnifiedDiff;
    let skippedFiles = 0;
    try {
      const loaded = await runLog.step(
        'Loading PR diff',
        () => loadDiff(this.deps, pull, repo, runLog),
        { kind: 'tool' },
      );
      diff = loaded.diff;
      skippedFiles = loaded.skippedFiles;
    } catch (err) {
      runLog.error(`Failed to load PR diff: ${(err as Error).message}`);
      await failAll(`Failed to load PR diff: ${(err as Error).message}`);
      return;
    }
    // BE-11: an empty diff is a failed run, not a clean review of nothing.
    // Before any LLM call, and the head is never marked reviewed.
    if (diff.files.length === 0) {
      const msg = 'The PR diff is empty — nothing to review';
      runLog.error(msg);
      await failAll(msg);
      return;
    }
    // XC-5: a bounded prompt. The cut is visible in every run's log, and a
    // partial review never marks the head reviewed (it did not see all of it).
    const capped = capDiff(diff, MAX_DIFF_CHARS, this.deps.parseDiff);
    diff = capped.diff;
    if (capped.truncated) {
      runLog.info(
        `Diff truncated to ${diff.raw.length} characters (limit ${MAX_DIFF_CHARS}): ` +
          `${capped.omittedFiles} file(s) not reviewed — this review is partial`,
      );
    }
    runLog.info(`Diff ready — ${diff.files.length} changed file(s); starting ${jobs.length} agent run(s)`);

    for (const { agent, runId } of jobs) {
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
          capped.truncated || skippedFiles > 0,
        );
        logger?.info(
          {
            runId,
            agent: agent.name,
            findings: outcome.findingsCount,
            grounding: outcome.grounding,
            durationMs: Date.now() - agentStart,
          },
          `review: agent "${agent.name}" done — ${outcome.findingsCount} finding(s)`,
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
    }
  }

  /** Execute a single agent's review against a PR, streaming progress. */
  private async runOneAgent(
    workspaceId: string,
    pull: ReviewPull,
    repo: RepoRef,
    diff: UnifiedDiff,
    agent: Agent,
    runId: string,
    parentLog: RunLogger,
    partial: boolean,
  ): Promise<RunOutcome> {
    const start = Date.now();
    // Narrow the fanned-out pre-work logger to THIS run; the shared diff/intent
    // events are already in this run's buffer, so the persisted trace below
    // (built from the buffer) includes them too.
    const runLog = parentLog.forRun(runId, { agent: agent.name });

    runLog.info(`Starting review with agent "${agent.name}" (${agent.provider}/${agent.model})`);

    try {
      // Resolve the agent's LLM provider. (The resolver throws if the provider
      // key is missing — caught below and persisted as a failed run.)
      const llm = await runLog.step(
        `Resolving ${agent.provider} provider`,
        () => this.deps.llm(agent.provider),
        { kind: 'tool' },
      );

      // M2 — the agent's effective skills (linked + enabled on the link +
      // enabled globally, in link order), read once: this snapshot serves the
      // whole run, so an edit made mid-run does not change it. Unlike
      // repo-intel context, a failed read fails the run.
      const skills = await this.deps.skills.effectiveSkills(agent.id);
      const skillBlocks = skills.length > 0 ? formatSkills(skills) : undefined;
      // Exactly the string assemblePrompt stores as `prompt_assembly.skills`.
      const skillsTokens = skillBlocks ? this.deps.tokens.count(skillBlocks.join('\n\n')) : null;
      runLog.info(skillsLogLine(skills, skillsTokens ?? 0));

      // Per-agent repo-intel toggle (Agent editor). When an agent opts out we
      // skip all enrichment entirely so its prompt is identical to the
      // repo-intel-off baseline — independent of the global REPO_INTEL_ENABLED
      // flag, which still gates the facade internally.
      const repoIntelOn = agent.repo_intel !== false;
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

      // ---- Engine: assemble → single-pass → grounding -----------------------
      // The pure review pipeline lives in @devdigest/reviewer-core (shared with
      // the CI runner). The service owns only I/O: repo-intel context resolution
      // above, and persistence + observability below.
      const outcome = await reviewPullRequest({
        systemPrompt: agent.system_prompt,
        model: agent.model,
        diff,
        llm,
        maxTokens: REVIEW_MAX_OUTPUT_TOKENS,
        // Per-agent review strategy (configured in the Agent editor); falls back
        // to the studio default. single-pass = whole diff in one call.
        strategy: agent.strategy ?? REVIEW_STRATEGY,
        // T1.3 — pass the callers digest only when we built one. assemblePrompt
        // omits the section when this is empty/undefined.
        ...(callersDigest ? { callers: callersDigest } : {}),
        // T3 — repo skeleton, same omit-when-empty contract.
        ...(repoMap ? { repoMap } : {}),
        // M2 — skill blocks; omitted (no `## Skills / rules`) with no skill.
        ...(skillBlocks ? { skills: skillBlocks } : {}),
        // PR author's description/body — untrusted; assemblePrompt wraps +
        // truncates it. Omitted when the PR has no body.
        ...(pull.body ? { prDescription: pull.body } : {}),
        prMeta: { title: pull.title, author: pull.author },
        task,
        sessionId: `${repo.owner}/${repo.name}#${pull.number}:${agent.name}`,
        onEvent: (e) => runLog.event(e.kind, e.msg, e.data),
        checkCancelled: () => {
          if (this.deps.events.isCancelled(runId)) throw new RunCancelledError();
        },
        // Cancel aborts the LLM request in flight, not just the next checkpoint.
        signal: this.deps.events.signal(runId),
      });
      const { tokensIn, tokensOut, costUsd, grounding } = outcome;

      // Cancel may have arrived while the model was answering — the engine's
      // own checkpoints are all before the call. A cancelled run saves nothing.
      if (this.deps.events.isCancelled(runId)) throw new RunCancelledError();

      const keptFindings = outcome.review.findings;
      const findingsCount = keptFindings.length;
      const durationMs = Date.now() - start;

      // Deterministic blocker count (severity ≥ the agent's gate) — the signal
      // the timeline colors on, NOT the model's self-reported verdict.
      const blockers = countBlockers(keptFindings, agent.ci_fail_on);

      runLog.info(`Persisting review with ${findingsCount} finding(s) and the run trace`);
      const trace: RunTrace = {
        config: {
          agent: agent.name,
          version: String(agent.version),
          provider: agent.provider,
          model: agent.model,
          pr: pull.number,
          source: 'local',
        },
        stats: {
          duration_ms: durationMs,
          tokens_in: tokensIn,
          tokens_out: tokensOut,
          cost_usd: costUsd,
          findings: findingsCount,
          grounding,
        },
        prompt_assembly: {
          ...outcome.assembly,
          skills_tokens: skillsTokens,
          skills_used: skills.length > 0 ? skills.map((s) => ({ id: s.id, name: s.name, version: s.version })) : null,
        },
        tool_calls: outcome.chunks.map((c) => ({
          tool: 'review_file',
          args: c.label,
          meta: outcome.mode,
          ms: Math.round(durationMs / Math.max(outcome.chunks.length, 1)),
        })),
        raw_output: outcome.raw,
        memory_pulled: [],
        specs_read: [],
        // Persisted log = the run's FULL event buffer (incl. shared pre-work:
        // diff load + intent), not just events recorded inside this method.
        log: runLog.logFor(runId),
      };

      // ---- Persist review + findings + agent_runs + run_traces, atomically --
      const saved = await this.deps.store.saveReviewOutcome({
        runId,
        review: {
          workspaceId,
          prId: pull.id,
          agentId: agent.id,
          runId,
          kind: 'review',
          verdict: outcome.review.verdict,
          summary: outcome.review.summary,
          score: outcome.review.score,
          model: agent.model,
        },
        findings: keptFindings,
        completion: {
          status: 'done',
          durationMs,
          tokensIn,
          tokensOut,
          costUsd,
          findingsCount,
          grounding,
          score: outcome.review.score,
          blockers,
          error: null,
        },
        trace,
      });
      // Null: the run stopped being `running` between the check above and the
      // save (cancelled meanwhile) — the transaction wrote nothing.
      if (!saved) throw new RunCancelledError();
      runLog.result(`Persisted review ${saved.reviewId} with ${findingsCount} finding(s)`);

      // Mark the commit this review ran against so the PR list can tell
      // reviewed / needs-review (head moved) / stale apart. After the commit,
      // and best-effort: the review is already saved, so a failure here must
      // not turn the run into a failed one.
      if (partial) {
        runLog.info('Partial review (diff truncated or files without a patch) — the commit is not marked reviewed');
      } else {
        await this.deps.pulls.markReviewed(pull.id, pull.headSha).catch((err: unknown) => {
          runLog.info(`Could not record the reviewed commit: ${(err as Error).message}`);
        });
      }

      runLog.info('Run complete; trace persisted');
      this.deps.events.complete(runId);

      return { reviewId: saved.reviewId, findingsCount, grounding, raw: outcome.review };
    } catch (err) {
      // Failure/cancel: persist status + the error text + the log-so-far so the
      // run (and WHY it failed) is visible on the UI after a reload. A cancelled
      // run is already `cancelled` in the DB, so the guarded update is a no-op.
      // An aborted LLM call surfaces as the SDK's abort error: still a cancel.
      const cancelled = err instanceof RunCancelledError || this.deps.events.isCancelled(runId);
      const status = cancelled ? 'cancelled' : 'failed';
      const msg = cancelled ? 'Cancelled by user' : (err as Error).message;
      // Output that never validated was still billed: keep its usage on the run.
      const failed = !cancelled && err instanceof StructuredOutputError ? err : null;
      const usage: LlmUsage = failed?.usage ?? { tokensIn: 0, tokensOut: 0, costUsd: null };
      runLog.error(cancelled ? 'Run cancelled by user' : `Run failed: ${msg}`);
      await this.deps.store
        .completeAgentRun(runId, {
          status,
          durationMs: Date.now() - start,
          ...usage,
          findingsCount: 0,
          grounding: '0/0 passed',
          error: msg,
        })
        .catch(() => undefined);
      await this.deps.store
        .saveRunTrace(
          runId,
          this.traceFromBuffer(runId, pull, agent, '0/0 passed', Date.now() - start, usage, failed?.raw),
        )
        .catch(() => undefined);
      this.deps.events.complete(runId);
      throw cancelled && !(err instanceof RunCancelledError) ? new RunCancelledError() : err;
    } finally {
      // The run has exited: its cancellation request (if any) is spent.
      this.deps.events.clearCancelled(runId);
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
      rows = await this.deps.repoIntel.getCallerSignatures(repoId, changedFiles, 10);
    } catch (err) {
      // Never let an enrichment break the run — surface only as a Live Log info.
      runLog.info(`callers digest: repoIntel failed — ${(err as Error).message}`);
      return undefined;
    }
    if (rows.length === 0) return undefined;

    const byFile = new Map<string, string[]>();
    for (const r of rows) {
      const lines = byFile.get(r.file) ?? [];
      lines.push(`- \`${r.symbol}\` — ${r.signature}`);
      byFile.set(r.file, lines);
    }
    const out: string[] = [];
    for (const [file, lines] of byFile) {
      out.push(`### ${file}`);
      out.push(...lines);
    }
    runLog.info(`callers digest: ${rows.length} caller signature(s) attached`);
    return out.join('\n');
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
      const hot = ranks.filter((r) => r.percentile >= 95);
      if (hot.length === 0) return '';
      runLog.info(`file rank: ${hot.length}/${changedFiles.length} changed file(s) in top 5%`);
      return `\n\n${hot.length} of ${changedFiles.length} changed file(s) are in the top 5% most-depended-on (high blast risk) — prioritise their correctness.`;
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
    pull: ReviewPull,
    agent: Agent,
    grounding: string,
    durationMs = 0,
    usage: LlmUsage = { tokensIn: 0, tokensOut: 0, costUsd: null },
    rawOutput = '',
  ): RunTrace {
    return {
      config: {
        agent: agent.name,
        version: String(agent.version),
        provider: agent.provider,
        model: agent.model,
        pr: pull.number,
        source: 'local',
      },
      stats: {
        duration_ms: durationMs,
        tokens_in: usage.tokensIn,
        tokens_out: usage.tokensOut,
        cost_usd: usage.costUsd,
        findings: 0,
        grounding,
      },
      prompt_assembly: {
        system: agent.system_prompt,
        skills: null,
        skills_tokens: null,
        skills_used: null,
        memory: null,
        specs: null,
        user: '',
      },
      tool_calls: [],
      raw_output: rawOutput,
      memory_pulled: [],
      specs_read: [],
      log: this.deps.events.buffer(runId).map((e) => ({ t: e.t, kind: e.kind, msg: e.msg })),
    };
  }
}
