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
  /** Repo skeleton / map (T3); null when absent. Enables per-slot token
      attribution in the run trace. */
  repo_map: z.string().nullish(),
  /** PR author's description/body (truncated); null when absent. */
  pr_description: z.string().nullish(),
  /** L03 — derived PR intent (free-text summary), rendered as one string;
      null when intent resolution was skipped/failed. */
  intent: z.string().nullish(),
  /** Revision 2 (specs/05-intent-layer.md) — the composed "## Declared PR
      scope" block (in_scope/out_of_scope, one rendered string, mirroring how
      every other slot here stores exactly one rendered section's raw text);
      null when both arrays were empty/undefined. */
  intent_scope: z.string().nullish(),
  user: z.string(),
});
export type PromptAssembly = z.infer<typeof PromptAssembly>;

export const MemoryPulled = z.object({
  pr: z.number().int().nullish(),
  text: z.string(),
});
export type MemoryPulled = z.infer<typeof MemoryPulled>;

/**
 * specs/09-project-context-folder.md — one document the project-context
 * resolver considered for a run, whatever the outcome. Replaces the old
 * bare-path `specs_read: string[]` (always `[]` — the slot shipped empty
 * since the skills lesson). Every persisted trace from before this feature
 * has `specs_read: []`, which still parses cleanly against this widened type.
 *
 *  - `status: 'included'`  — actually injected into the assembled prompt.
 *    `tokens` is its real token count; `reason` is null.
 *  - `status: 'omitted'`   — could not be read (missing / unreadable /
 *    not a regular file / oversize at read time / the pinned repo has no
 *    synced checkout / pinned to a different repo than this run's). `reason`
 *    names which; `tokens` is 0 (never read).
 *  - `status: 'refused'`   — the recorded path resolved outside the pinned
 *    repo's checkout (`..`, an absolute path, or a symlink escape) and was
 *    never read (AC-27). `reason` is `'refused_containment'`; `tokens` is 0.
 *  - `status: 'dropped'`   — read successfully, but cut by the token-budget
 *    reduction (AC-21/AC-32). `tokens` is its real count; `reason` is
 *    `'budget_drop'`.
 *
 * `origin`/`skill` record whether the document reached the agent directly or
 * was inherited from an enabled skill (AC-18) — `skill` is the skill's name
 * when `origin === 'skill'`, null otherwise.
 */
export const SpecReadOrigin = z.enum(['agent', 'skill']);
export type SpecReadOrigin = z.infer<typeof SpecReadOrigin>;

export const SpecReadStatus = z.enum(['included', 'omitted', 'refused', 'dropped']);
export type SpecReadStatus = z.infer<typeof SpecReadStatus>;

export const SpecRead = z.object({
  path: z.string(),
  tokens: z.number().int(),
  origin: SpecReadOrigin,
  skill: z.string().nullish(),
  status: SpecReadStatus,
  reason: z.string().nullish(),
});
export type SpecRead = z.infer<typeof SpecRead>;

export const RunStats = z.object({
  duration_ms: z.number().int(),
  tokens_in: z.number().int(),
  tokens_out: z.number().int(),
  cost_usd: z.number().nullable(),
  findings: z.number().int(),
  grounding: z.string(),
});
export type RunStats = z.infer<typeof RunStats>;

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
  specs_read: z.array(SpecRead),
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
