import { z } from 'zod';

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
  /** Stated PR intent/scope digest; null when absent. */
  intent: z.string().nullish(),
  /** Repo skeleton / map (T3); null when absent. Enables per-slot token
      attribution in the run trace. */
  repo_map: z.string().nullish(),
  /** PR author's description/body (truncated); null when absent. */
  pr_description: z.string().nullish(),
  user: z.string(),
});
export type PromptAssembly = z.infer<typeof PromptAssembly>;

export const MemoryPulled = z.object({
  pr: z.number().int().nullish(),
  text: z.string(),
});
export type MemoryPulled = z.infer<typeof MemoryPulled>;

export const RunStats = z.object({
  duration_ms: z.number().int(),
  tokens_in: z.number().int(),
  tokens_out: z.number().int(),
  /**
   * USD billed for this run. Null — never 0 — when the price is unknown (model
   * missing from the price book) or the run never reached the model. The UI
   * renders null as "—"; a 0 would read as "this review was free".
   */
  cost_usd: z.number().nullable(),
  findings: z.number().int(),
  grounding: z.string(),
});
export type RunStats = z.infer<typeof RunStats>;

/**
 * One Project Context document considered for a run. `included` = its text is
 * in `prompt_assembly.specs`; `missing` = the path didn't exist on the PR's
 * target branch; `skipped_budget` = it would have pushed the context past the
 * configured token budget. `source` says whether the agent attached it
 * directly or inherited it from a linked skill.
 */
export const SpecReadStatus = z.enum(['included', 'missing', 'skipped_budget']);
export type SpecReadStatus = z.infer<typeof SpecReadStatus>;

export const SpecReadEntry = z.object({
  path: z.string(),
  tokens: z.number().int().nullable(),
  status: SpecReadStatus,
  source: z.enum(['agent', 'skill']),
  skill_name: z.string().nullish(),
});
export type SpecReadEntry = z.infer<typeof SpecReadEntry>;

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
  /** Project Context documents. Traces recorded before the feature stored
   *  bare path strings — readers must accept both shapes. */
  specs_read: z.array(z.union([z.string(), SpecReadEntry])),
  /** Skill ids actually attached (linked + enabled) at run time; null/absent
   *  on runs recorded before this field existed — treat as no skills used,
   *  no backfill. Feeds the Stats tab's "most-used skills" aggregation. */
  skills_used: z.array(z.string()).nullish(),
  log: z.array(RunLogLine),
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
  /** USD billed for this run; null when unpriced or unfinished. See RunStats. */
  cost_usd: z.number().nullable(),
  findings_count: z.number().int().nullable(),
  grounding: z.string().nullable(),
  ran_at: z.string().nullable(),
  // Review outcome, denormalized onto the run row at completion (the timeline
  // has no FK to the review). score = the review's 0-100 score; blockers =
  // findings that trip the agent's gate. Null on failed/cancelled runs.
  score: z.number().int().nullable(),
  blockers: z.number().int().nullable(),
  // Per-severity tally, snapshotted alongside blockers at run completion. Null
  // on runs from before this field existed, and on failed/cancelled runs.
  critical_count: z.number().int().nullable(),
  warning_count: z.number().int().nullable(),
  suggestion_count: z.number().int().nullable(),
});
export type RunSummary = z.infer<typeof RunSummary>;

/**
 * A run row scoped to an AGENT rather than a PR (the Agent Editor's Stats tab
 * "Run history" table, across every PR the agent has reviewed) — so unlike
 * `RunSummary` it needs to carry PR identity + source explicitly.
 */
export const AgentRunSummary = RunSummary.extend({
  pr_number: z.number().int().nullable(),
  pr_title: z.string().nullable(),
  source: z.enum(['local', 'ci']).nullable(),
});
export type AgentRunSummary = z.infer<typeof AgentRunSummary>;
