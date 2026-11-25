import type { RunTrace } from '@devdigest/shared';
import type { reviewPullRequest } from '@devdigest/reviewer-core';
import type { RunEvents, RunLog } from '../domain/ports.js';
import type { PullRequest, ReviewAgent } from '../domain/types.js';
import type { RunUsage } from './run-types.js';

type EngineOutcome = Awaited<ReturnType<typeof reviewPullRequest>>;

/**
 * Cost to persist for a run: no usage at all means "no data" (null → "—" in the
 * UI), never $0 — a free model with real usage still records its genuine 0.
 */
export function runCost(tokensIn: number, tokensOut: number, costUsd: number | null): number | null {
  return tokensIn + tokensOut > 0 ? costUsd : null;
}

/** The ONE run_traces document persisted for a successful run. */
export function buildRunTrace(
  pull: PullRequest,
  agent: ReviewAgent,
  runId: string,
  runLog: RunLog,
  outcome: EngineOutcome,
  stats: {
    durationMs: number;
    tokensIn: number;
    tokensOut: number;
    costUsd: number | null;
    findings: number;
    grounding: string;
  },
): RunTrace {
  const { durationMs, tokensIn, tokensOut, costUsd, grounding } = stats;
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
      tokens_in: tokensIn,
      tokens_out: tokensOut,
      cost_usd: costUsd,
      findings: stats.findings,
      grounding,
    },
    prompt_assembly: outcome.assembly,
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
    // diff load + intent), not just events recorded inside runOneAgent.
    log: runLog.logFor(runId),
  };
}

/**
 * A minimal RunTrace whose `log` is the run's full SSE buffer — persisted on
 * failure/cancel (and pre-work failures) so the events (and WHY it failed)
 * survive a reload, not just the in-memory stream.
 */
export function traceFromBuffer(
  runBus: Pick<RunEvents, 'buffer'>,
  runId: string,
  pull: PullRequest,
  agent: ReviewAgent,
  grounding: string,
  durationMs = 0,
  usage: RunUsage = {
    tokensIn: 0,
    tokensOut: 0,
    costUsd: null,
  },
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
      cost_usd: runCost(usage.tokensIn, usage.tokensOut, usage.costUsd),
      findings: 0,
      grounding,
    },
    prompt_assembly: { system: agent.systemPrompt, skills: null, memory: null, specs: null, user: '' },
    tool_calls: [],
    raw_output: '',
    memory_pulled: [],
    specs_read: [],
    log: runBus.buffer(runId).map((e) => ({ t: e.t, kind: e.kind, msg: e.msg })),
  };
}
