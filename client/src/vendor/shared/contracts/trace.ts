import { z } from 'zod';
import { IntentChangeType, IntentConfidence, IntentDerivedFrom, IntentSource } from './brief.js';

/**
 * Run trace. The ENTIRE trace of one run is persisted as a SINGLE
 * jsonb document in `run_traces` (not per-row). Live events stream via SSE
 * during the run; the full log is written once on completion.
 */

export const RunEventKind = z.enum(['info', 'tool', 'result', 'error']);
export type RunEventKind = z.infer<typeof RunEventKind>;

/** A single live-log line. `t` = elapsed timestamp string (e.g. "00.31"). */
export const RunLogLine = z.object({
  t: z.string(),
  kind: RunEventKind,
  msg: z.string(),
});
export type RunLogLine = z.infer<typeof RunLogLine>;

/** SSE payload streamed on `/runs/:id/events`. */
export const RunEvent = z.object({
  runId: z.string(),
  seq: z.number().int(),
  kind: RunEventKind,
  msg: z.string(),
  t: z.string(),
  data: z.unknown().optional(),
});
export type RunEvent = z.infer<typeof RunEvent>;

export const ToolCall = z.object({
  tool: z.string(),
  args: z.string(),
  meta: z.string().nullish(),
  ms: z.number().int(),
});
export type ToolCall = z.infer<typeof ToolCall>;

export const PromptAssembly = z.object({
  system: z.string(),
  skills: z.string().nullish(),
  memory: z.string().nullish(),
  specs: z.string().nullish(),
  /** Callers-of-changed-symbols digest (T1.3); null when absent. */
  callers: z.string().nullish(),
  /** Repo skeleton / map (T3); null when absent. Enables per-slot token
      attribution in the run trace. */
  repo_map: z.string().nullish(),
  /** PR author's description/body (truncated); null when absent. */
  pr_description: z.string().nullish(),
  /**
   * `## PR intent` content (server/specs/05-intent-layer.md), untrusted;
   * null when the run had no intent (kill switch off, or derivation
   * unavailable) — the prompt is then byte-identical to before this feature.
   */
  intent: z.string().nullish(),
  user: z.string(),
});
export type PromptAssembly = z.infer<typeof PromptAssembly>;

/**
 * The intent layer's contribution to one run's trace: status + the derivation
 * that fed it (or the reason it didn't). Cost here is informational — it is
 * NEVER folded into `RunStats.cost_usd` (server/specs/05-intent-layer.md).
 */
export const IntentTrace = z.object({
  status: z.enum(['used', 'unavailable']),
  /** True when this run reused a cached derivation (no LLM call this run). */
  cache_hit: z.boolean().nullish(),
  confidence: IntentConfidence.nullish(),
  derived_from: IntentDerivedFrom.nullish(),
  change_type: IntentChangeType.nullish(),
  provider: z.string().nullish(),
  model: z.string().nullish(),
  tokens_in: z.number().int().nullish(),
  tokens_out: z.number().int().nullish(),
  cost_usd: z.number().nullish(),
  sources: z.array(IntentSource).nullish(),
  /** Reason intent is unavailable (status='unavailable'), e.g. "config_error: …". */
  warning: z.string().nullish(),
});
export type IntentTrace = z.infer<typeof IntentTrace>;

export const MemoryPulled = z.object({
  pr: z.number().int().nullish(),
  text: z.string(),
});
export type MemoryPulled = z.infer<typeof MemoryPulled>;

export const RunStats = z.object({
  duration_ms: z.number().int(),
  tokens_in: z.number().int(),
  tokens_out: z.number().int(),
  // USD cost of every LLM response the run received (failed/cancelled runs
  // included); null = unpriced model. nullish: traces written before cost
  // tracking have no key.
  cost_usd: z.number().nullish(),
  findings: z.number().int(),
  grounding: z.string(),
});
export type RunStats = z.infer<typeof RunStats>;

/** A skill (at an exact version) that was part of a run's prompt. */
export const SkillUsed = z.object({
  id: z.string(),
  name: z.string(),
  version: z.number().int(),
});
export type SkillUsed = z.infer<typeof SkillUsed>;

/** The single-document trace stored in `run_traces.trace`. */
export const RunTrace = z.object({
  config: z.object({
    agent: z.string(),
    version: z.string().nullish(),
    provider: z.string().nullish(),
    model: z.string(),
    pr: z.number().int().nullish(),
    source: z.enum(['local', 'ci']).default('local'),
  }),
  stats: RunStats,
  prompt_assembly: PromptAssembly,
  tool_calls: z.array(ToolCall),
  raw_output: z.string(),
  memory_pulled: z.array(MemoryPulled),
  specs_read: z.array(z.string()),
  log: z.array(RunLogLine),
  /** Skills in the prompt, in order; body = skill_versions[id, version]. Absent on old traces. */
  skills_used: z.array(SkillUsed).nullish(),
  /** Intent layer contribution to this run; null when the run had no intent. */
  intent: IntentTrace.nullish(),
});
export type RunTrace = z.infer<typeof RunTrace>;

/**
 * One row of a PR's run history (every agent_runs row, any status). Surfaced on
 * the PR page so runs — including FAILED ones with their error — survive reload.
 */
export const RunSummary = z.object({
  run_id: z.string(),
  agent_id: z.string().nullable(),
  agent_name: z.string().nullable(),
  provider: z.string().nullable(),
  model: z.string().nullable(),
  status: z.string().nullable(), // running | done | failed | cancelled
  error: z.string().nullable(),
  duration_ms: z.number().int().nullable(),
  tokens_in: z.number().int().nullable(),
  tokens_out: z.number().int().nullable(),
  // USD cost of the run (any status); null = unknown (unpriced model or a run
  // recorded before cost tracking).
  cost_usd: z.number().nullable(),
  findings_count: z.number().int().nullable(),
  grounding: z.string().nullable(),
  ran_at: z.string().nullable(),
  // Review outcome, denormalized onto the run row at completion (the timeline
  // has no FK to the review). score = the review's 0-100 score; blockers =
  // findings that trip the agent's gate. Null on failed/cancelled runs.
  score: z.number().int().nullable(),
  blockers: z.number().int().nullable(),
});
export type RunSummary = z.infer<typeof RunSummary>;

/** One in-flight run of a PR — GET /pulls/:id/runs/active (agent_runs where status='running'). */
export const ActiveRun = z.object({
  run_id: z.string(),
  agent_id: z.string().nullable(),
  agent_name: z.string().nullable(),
  ran_at: z.string().nullable(),
});
export type ActiveRun = z.infer<typeof ActiveRun>;
