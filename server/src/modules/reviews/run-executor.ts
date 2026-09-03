import PQueue from 'p-queue';
import type { Container } from '../../platform/container.js';
import type { Provider, Review, RunTrace, UnifiedDiff } from '@devdigest/shared';
import { reviewPullRequest, countBlockers, severityCounts } from '@devdigest/reviewer-core';
import { RunLogger, type PinoLike } from '../../platform/run-logger.js';
import type * as schema from '../../db/schema.js';
import type { AgentRow } from '../../db/rows.js';
import type { ReviewRepository, FindingRow, PullRow, ReviewRow } from './repository.js';
import { taskLine, toSkillPromptBlock } from './helpers.js';
import { loadDiff } from './diff-loader.js';
import { resolveEnabledSkills } from '../agents/helpers.js';

/**
 * Bounds how many agents run their reviews at once (see the comment at the
 * `PQueue` call site in `executeRuns`).
 */
export const AGENT_CONCURRENCY = 4;

/** Thrown by a run when the user cancels it mid-flight (between map files). */
export class RunCancelledError extends Error {
  constructor() {
    super('Run cancelled');
    this.name = 'RunCancelledError';
  }
}

/**
 * Minimal structured logger (pino-compatible: (obj, msg)) for runtime logs.
 * Aliased to the platform type so there is one definition, not two identical
 * ones; kept exported here because callers already import it from this module.
 */
export type Logger = PinoLike;

// A reduced "Review per file" — same schema as Review (the model returns a small
// Review per file; we merge findings + take the worst verdict / mean score).
export type RunOutcome = {
  review: ReviewRow;
  findings: FindingRow[];
  grounding: string;
  raw: Review;
};

/**
 * Owns the background execution of queued agent runs (extracted from
 * ReviewService; behaviour unchanged). Loads the diff + intent once, then
 * map-reduces each agent, streaming events over the runBus and persisting each
 * review. Per-agent failures are isolated.
 */
export class ReviewRunExecutor {
  constructor(
    private container: Container,
    private repo: ReviewRepository,
    private agents: Container['agentsRepo'],
  ) {}

  /**
   * Background execution of the queued agent runs (NOT awaited by the route).
   * Loads the diff + intent once, then map-reduces each agent, streaming events
   * over the runBus and persisting each review. Per-agent failures are isolated.
   */
  async executeRuns(
    workspaceId: string,
    pull: PullRow,
    repo: typeof schema.repos.$inferSelect,
    jobs: { agent: AgentRow; runId: string }[],
    logger?: Logger,
  ): Promise<void> {
    // ONE logger fanned out over every queued run: shared pre-work (diff +
    // intent) is streamed into each target agent's Live Log and persisted into
    // each run's trace. Per-agent work below narrows it to a single run.
    const runLog = new RunLogger(
      this.container.runBus,
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
        this.container.runBus.complete(runId);
      }
    };

    let diff: UnifiedDiff;
    try {
      diff = await runLog.step('Loading PR diff', () => loadDiff(this.container, this.repo, workspaceId, pull, repo), {
        kind: 'tool',
      });
    } catch (err) {
      runLog.error(`Failed to load PR diff: ${(err as Error).message}`);
      await failAll(`Failed to load PR diff: ${(err as Error).message}`);
      return;
    }
    runLog.info(`Diff ready — ${diff.files.length} changed file(s); starting ${jobs.length} agent run(s)`);

    // Intent — the PR's stated summary/in-scope/out-of-scope, when it has
    // been computed. Loaded once here (like diff above) and shared across
    // every queued agent, not recomputed per agent. Best-effort: never let
    // this break the run.
    const intentDigest = await this.buildIntentDigest(pull.id, runLog);

    // Queued agents are independent reviews (different agent, own runId, own
    // trace) — running them one after another serialized total wall time to
    // N × (one agent's review time) for no reason. Run them concurrently, but
    // bounded: each holds a DB connection across its persist transaction, so
    // an unbounded Promise.all over jobs.length agents (a workspace can
    // enable more than the 4 built-ins) would let concurrent agent runs pile
    // onto the connection pool (10 by default) with no backpressure.
    const queue = new PQueue({ concurrency: AGENT_CONCURRENCY });
    await queue.addAll(
      jobs.map(({ agent, runId }) => async () => {
        const agentStart = Date.now();
        logger?.info(
          { runId, agent: agent.name, provider: agent.provider, model: agent.model, prId: pull.id },
          `review: agent "${agent.name}" started (${agent.provider}/${agent.model})`,
        );
        try {
          const outcome = await this.runOneAgent(workspaceId, pull, repo, diff, intentDigest, agent, runId, runLog);
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
    repo: typeof schema.repos.$inferSelect,
    diff: UnifiedDiff,
    intentDigest: string | undefined,
    agent: AgentRow,
    runId: string,
    parentLog: RunLogger,
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
        () => this.container.llm(agent.provider as Provider),
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

      // Skills — the agent's linked + enabled skill bodies (Agent Editor's
      // Skills tab), independent of repo-intel. A skill only lands here when
      // it's BOTH linked to this agent AND globally enabled.
      const { bodies: skillBodies, ids: skillIds } = await this.buildSkillsBodies(agent.id, runLog);

      const task = taskLine(pull) + rankNote;

      // Skills — the agent's linked guidance, in the order the user arranged it.
      // Only links whose per-agent switch AND whose skill's own `enabled` are
      // both on reach the prompt; an agent with none produces a prompt byte-
      // identical to the pre-skills one, because assemblePrompt omits the
      // section when the array is empty.
      const skillBlocks = await this.buildSkillBlocks(agent.id, runLog);

      // ---- Engine: assemble → single-pass → grounding -----------------------
      // The pure review pipeline lives in @devdigest/reviewer-core (shared with
      // the CI runner). The service owns only I/O: repo-intel context resolution
      // above, and persistence + observability below.
      const outcome = await reviewPullRequest({
        systemPrompt: agent.systemPrompt,
        model: agent.model,
        diff,
        llm,
        // Linked skills, already rendered as `### name` blocks. Omitted entirely
        // when the agent has none.
        ...(skillBlocks.length > 0 ? { skills: skillBlocks } : {}),
        // T1.3 — pass the callers digest only when we built one. assemblePrompt
        // omits the section when this is empty/undefined.
        ...(callersDigest ? { callers: callersDigest } : {}),
        // T3 — repo skeleton, same omit-when-empty contract.
        ...(repoMap ? { repoMap } : {}),
        // Agent's linked + enabled skill bodies. Omitted when the agent has
        // none — assemblePrompt drops the section entirely in that case.
        ...(skillBodies.length > 0 ? { skills: skillBodies } : {}),
        // PR author's description/body — untrusted; assemblePrompt wraps +
        // truncates it. Omitted when the PR has no body.
        ...(pull.body ? { prDescription: pull.body } : {}),
        // Stated PR intent/scope digest, when computed. Same omit-when-empty
        // contract as the other digests.
        ...(intentDigest ? { intent: intentDigest } : {}),
        task,
        sessionId: `${repo.owner}/${repo.name}#${pull.number}:${agent.name}`,
        onEvent: (e) => runLog.event(e.kind, e.msg, e.data),
        checkCancelled: () => {
          if (this.container.runBus.isCancelled(runId)) throw new RunCancelledError();
        },
      });
      const { tokensIn, tokensOut, costUsd, grounding } = outcome;

      const keptFindings = outcome.review.findings;

      // ---- Persist review + findings -----------------------------------------
      // One unit of work: a review with no findings row, or a review the PR's
      // last-reviewed-sha doesn't reflect, is an inconsistent state a crash
      // between these writes could otherwise leave behind. The caller (here)
      // owns the transaction; the repository methods just accept the handle.
      const { review, findingRows } = await this.container.db.transaction(async (tx) => {
        const review = await this.repo.insertReview(
          {
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
          tx,
        );
        const findingRows = await this.repo.insertFindings(review.id, keptFindings, tx);
        // Mark the commit this review ran against so the PR list can tell
        // reviewed / needs-review (head moved) / stale apart.
        await this.repo.markReviewed(pull.id, pull.headSha, tx);
        return { review, findingRows };
      });
      runLog.result(`Persisted review ${review.id} with ${findingRows.length} finding(s)`);

      const durationMs = Date.now() - start;

      // Deterministic blocker count (severity ≥ the agent's gate) — the signal
      // the timeline colors on, NOT the model's self-reported verdict.
      const blockers = countBlockers(keptFindings, agent.ciFailOn);
      const counts = severityCounts(keptFindings);

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
        criticalCount: counts.CRITICAL,
        warningCount: counts.WARNING,
        suggestionCount: counts.SUGGESTION,
        error: null,
      });

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
          findings: findingRows.length,
          grounding,
        },
        prompt_assembly: outcome.assembly,
        tool_calls: [{ tool: 'review_file', args: 'all files', meta: 'single-pass', ms: durationMs }],
        raw_output: outcome.raw,
        memory_pulled: [],
        specs_read: [],
        skills_used: skillIds.length > 0 ? skillIds : null,
        // Persisted log = the run's FULL event buffer (incl. shared pre-work:
        // diff load + intent), not just events recorded inside this method.
        log: runLog.logFor(runId),
      };
      runLog.info('Run complete; trace persisted');
      await this.repo.saveRunTrace(runId, trace);
      this.container.runBus.complete(runId);

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
      this.container.runBus.complete(runId);
      throw err;
    }
  }

  /**
   * Resolve the agent's linked skills into prompt blocks, in link order.
   *
   * Best-effort by design: a DB hiccup here must not fail the review, so a
   * failure logs and yields no blocks (the prompt then matches the no-skills
   * baseline). The token count is logged so the run trace shows what the skills
   * cost — the same number the Skills tab's budget hint is based on.
   */
  private async buildSkillBlocks(agentId: string, runLog: RunLogger): Promise<string[]> {
    try {
      // Through the container: `reviews` must not import the agents module's
      // repository directly (no-cross-module-internals).
      const links = await this.container.agentsRepo.enabledSkillsForPrompt(agentId);
      if (links.length === 0) return [];

      const blocks = links.map((l) => toSkillPromptBlock(l.skill));
      const tokens = this.container.tokenizer.count(blocks.join('\n\n'));
      runLog.info(
        `skills: ${links.length} attached (+~${tokens} tokens) — ${links
          .map((l) => l.skill.name)
          .join(', ')}`,
      );
      return blocks;
    } catch (err) {
      runLog.info(`skills: skipped — ${(err as Error).message}`);
      return [];
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
      rows = await this.container.repoIntel.getCallerSignatures(repoId, changedFiles, 10);
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
   * Resolve the agent's linked skill bodies (+ ids, for `skills_used` on the
   * trace — Stats tab's "most-used skills") for the prompt's `## Skills /
   * rules` section — enabled links only (a skill disabled globally is
   * unavailable everywhere, even when still linked). Plain DB read through an
   * already-injected repository (not a degradable external facade like
   * repo-intel), so unlike the digest builders below this doesn't swallow
   * errors — a DB failure here should fail the run like any other DB error.
   */
  private async buildSkillsBodies(
    agentId: string,
    runLog: RunLogger,
  ): Promise<{ bodies: string[]; ids: string[] }> {
    const skills = await resolveEnabledSkills(this.agents, agentId);
    if (skills.length > 0) runLog.info(`skills: ${skills.length} enabled skill(s) attached`);
    return { bodies: skills.map((s) => s.body), ids: skills.map((s) => s.id) };
  }

  /**
   * Build a plain-text digest of the PR's stated intent (summary + in/out of
   * scope) for the prompt's intent slot. Returns `undefined` when intent
   * hasn't been computed for this PR yet — that's the normal steady state
   * for most PRs, not a failure, so unlike the other digest builders this
   * doesn't log an info line for the "nothing to attach" case.
   */
  private async buildIntentDigest(prId: string, runLog: RunLogger): Promise<string | undefined> {
    const record = await this.repo.getIntent(prId);
    if (!record) return undefined;

    const inScope = record.in_scope.length > 0 ? record.in_scope.map((s) => `- ${s}`).join('\n') : '(none stated)';
    const outOfScope =
      record.out_of_scope.length > 0 ? record.out_of_scope.map((s) => `- ${s}`).join('\n') : '(none stated)';

    const digest = `Summary: ${record.summary}\n\nIn scope:\n${inScope}\n\nOut of scope:\n${outOfScope}`;

    runLog.info(
      `intent: stated scope attached (${record.in_scope.length} in-scope, ${record.out_of_scope.length} out-of-scope item(s))`,
    );
    return digest;
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
      const map = await this.container.repoIntel.getRepoMap(repoId);
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
      const ranks = await this.container.repoIntel.getFileRank(repoId, changedFiles);
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
    pull: PullRow,
    agent: AgentRow,
    grounding: string,
    durationMs = 0,
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
      stats: { duration_ms: durationMs, tokens_in: 0, tokens_out: 0, cost_usd: null, findings: 0, grounding },
      prompt_assembly: { system: agent.systemPrompt, skills: null, memory: null, specs: null, user: '' },
      tool_calls: [],
      raw_output: '',
      memory_pulled: [],
      specs_read: [],
      log: this.container.runBus.buffer(runId).map((e) => ({ t: e.t, kind: e.kind, msg: e.msg })),
    };
  }
}
