/**
 * Pure builders of the single-document RunTrace persisted per run.
 */
import type { PromptAssembly, RunLogLine, RunTrace, SkillUsed } from '@devdigest/shared';
import { NO_GROUNDING } from './constants.js';
import type { ReviewAgent } from './types.js';

type TraceAgent = Pick<ReviewAgent, 'name' | 'version' | 'provider' | 'model' | 'systemPrompt'>;

export interface TraceUsage {
  tokensIn: number;
  tokensOut: number;
  costUsd: number | null;
}

function traceConfig(agent: TraceAgent, prNumber: number): RunTrace['config'] {
  return {
    agent: agent.name,
    version: String(agent.version),
    provider: agent.provider,
    model: agent.model,
    pr: prNumber,
    source: 'local',
  };
}

/** Trace of a finished run: engine outcome + the run's full event log. */
export function completedRunTrace(input: {
  agent: TraceAgent;
  prNumber: number;
  durationMs: number;
  usage: TraceUsage;
  findings: number;
  grounding: string;
  assembly: PromptAssembly;
  chunks: readonly { label: string }[];
  mode: string;
  raw: string;
  log: RunLogLine[];
  /** Skills in the prompt (id, name, exact version), in order. */
  skillsUsed?: SkillUsed[];
}): RunTrace {
  const { agent, durationMs, usage, chunks } = input;
  return {
    config: traceConfig(agent, input.prNumber),
    stats: {
      duration_ms: durationMs,
      tokens_in: usage.tokensIn,
      tokens_out: usage.tokensOut,
      cost_usd: usage.costUsd,
      findings: input.findings,
      grounding: input.grounding,
    },
    prompt_assembly: input.assembly,
    tool_calls: chunks.map((c) => ({
      tool: 'review_file',
      args: c.label,
      meta: input.mode,
      ms: Math.round(durationMs / Math.max(chunks.length, 1)),
    })),
    raw_output: input.raw,
    memory_pulled: [],
    specs_read: [],
    log: input.log,
    skills_used: input.skillsUsed ?? [],
  };
}

/**
 * A minimal trace whose `log` is the run's event buffer — persisted on
 * failure/cancel (and pre-work failures) so the events (and WHY it failed)
 * survive a reload, not just the in-memory stream.
 */
export function endedRunTrace(input: {
  agent: TraceAgent;
  prNumber: number;
  log: RunLogLine[];
  durationMs?: number;
  usage?: TraceUsage;
  skillsUsed?: SkillUsed[];
}): RunTrace {
  const usage = input.usage ?? { tokensIn: 0, tokensOut: 0, costUsd: 0 };
  return {
    config: traceConfig(input.agent, input.prNumber),
    stats: {
      duration_ms: input.durationMs ?? 0,
      tokens_in: usage.tokensIn,
      tokens_out: usage.tokensOut,
      cost_usd: usage.costUsd,
      findings: 0,
      grounding: NO_GROUNDING,
    },
    prompt_assembly: { system: input.agent.systemPrompt, skills: null, memory: null, specs: null, user: '' },
    tool_calls: [],
    raw_output: '',
    memory_pulled: [],
    specs_read: [],
    log: input.log,
    skills_used: input.skillsUsed ?? [],
  };
}
