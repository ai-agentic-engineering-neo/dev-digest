/**
 * specs/16-agent-performance-dashboard.md — pure aggregation helpers shared by
 * the global Agent Performance dashboard (`modules/ci/service.ts`) and the
 * per-agent Stats tab (`modules/agents/service.ts`). Both read the SAME
 * underlying query (`CiRepository.performanceRows`, scoped to all agents or
 * one) and derive figures through the SAME functions here, so AC-1 ("same
 * API, same rules") is structural rather than described in prose.
 *
 * `_shared` is `no-cross-module`-exempt (`server/.dependency-cruiser.cjs`),
 * but that exemption only covers OTHER modules importing FROM here — this
 * file itself must not import another module's types (the rule still fires
 * on `_shared -> ci` edges). `PerfSourceRow` below is therefore a LOCAL
 * structural mirror of `ci/repository.ts`'s `PerfRangeRow`, not an import of
 * it — the real row type satisfies this shape structurally with zero cast.
 */

/** Clarification #2 — below this many accept/dismiss decisions, an accept
 *  rate still renders but is marked low-sample and sorts last regardless of
 *  direction. */
export const LOW_SAMPLE_THRESHOLD = 20;

/** Clarification #5 — the fixed presets kept alongside the custom range
 *  picker (supersedes specs/14-export-to-ci.md D12's "no custom picker"). */
export const PERF_RANGE_PRESETS = [1, 7, 30, 90] as const;

/** Bound how large a custom `from`..`to` span may be, so neither the
 *  performance query nor `dailyTrend`'s day-by-day loop is unbounded. */
export const MAX_RANGE_DAYS = 366;

export type PerfRange = { days: number } | { from: Date; to: Date };

export interface ResolvedPerfRange {
  from: Date;
  to: Date;
  /** The selected preset, or `null` for a custom range (D12/AC-43). */
  rangeDays: number | null;
}

/** Resolve a `PerfRange` into concrete `[from, to)` dates. An out-of-list
 *  `days` value (defensive — routes already validate) falls back to 30. */
export function resolvePerfRange(range: PerfRange): ResolvedPerfRange {
  if ('days' in range) {
    const days = (PERF_RANGE_PRESETS as readonly number[]).includes(range.days) ? range.days : 30;
    const to = new Date();
    const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
    return { from, to, rangeDays: days };
  }
  return { from: range.from, to: range.to, rangeDays: null };
}

/** The immediately-preceding, equal-length window — used for the delta
 *  figures (clarification #6). */
export function previousPeriod(from: Date, to: Date): { from: Date; to: Date } {
  const spanMs = to.getTime() - from.getTime();
  return { from: new Date(from.getTime() - spanMs), to: from };
}

/** `current - previous`, but `null` (never a guessed baseline of 0) unless
 *  BOTH sides are known — null-is-not-zero (root CLAUDE.md, specs/01). */
export function numericDelta(current: number | null, previous: number | null): number | null {
  return current != null && previous != null ? current - previous : null;
}

/** One day's run count, as accumulated by `CiRepository.performanceRows`. */
export interface DayCount {
  day: string;
  count: number;
}

/** The subset of `ci/repository.ts`'s `PerfRangeRow` these helpers need —
 *  declared locally per `no-cross-module` (see file header). */
export interface PerfSourceRow {
  agentId: string;
  runsLocal: number;
  runsCi: number;
  /** Runs with `status === 'done'` — excludes running/failed from the
   *  denominator that would otherwise water down avg cost/latency (D1). */
  countedRuns: number;
  /** Runs with a non-null `costUsd` — the `avg_cost_usd` denominator. */
  costedRuns: number;
  /** Runs with a non-null `durationMs` — the `avg_latency_ms` denominator. */
  timedRuns: number;
  totalCostUsd: number | null;
  totalDurationMs: number | null;
  totalFindings: number;
  lastRunAt: Date | null;
  accepted: number;
  dismissed: number;
  pending: number;
  costProvider: number | null;
  costEstimated: number | null;
  costUnknown: number | null;
  runsByDay: DayCount[];
}

export interface CostBySource {
  provider: number | null;
  estimated: number | null;
  unknown: number | null;
}

export interface ComputedPerfMetrics {
  runs: number;
  decisions: number;
  accept_rate: number | null;
  dismiss_rate: number | null;
  avg_findings_per_run: number | null;
  avg_cost_usd: number | null;
  avg_latency_ms: number | null;
  cost_by_source: CostBySource;
  low_sample: boolean;
  runs_delta: number | null;
  accept_rate_delta: number | null;
  cost_delta: number | null;
}

/**
 * The ONE place both `ci/service.ts` (all agents) and `agents/service.ts`
 * (one agent) derive rates/averages/deltas from a `PerfSourceRow` — this is
 * what makes AC-1's "same rules" literal instead of aspirational.
 */
export function computeAgentMetrics(row: PerfSourceRow, prev: PerfSourceRow | undefined): ComputedPerfMetrics {
  const runs = row.runsLocal + row.runsCi;
  const decisions = row.accepted + row.dismissed;
  const accept_rate = decisions > 0 ? row.accepted / decisions : null;
  const dismiss_rate = decisions > 0 ? row.dismissed / decisions : null;
  const avg_findings_per_run = runs > 0 ? row.totalFindings / runs : null;
  const avg_cost_usd = row.costedRuns > 0 && row.totalCostUsd != null ? row.totalCostUsd / row.costedRuns : null;
  const avg_latency_ms =
    row.timedRuns > 0 && row.totalDurationMs != null ? row.totalDurationMs / row.timedRuns : null;

  const prevRuns = prev ? prev.runsLocal + prev.runsCi : null;
  const prevDecisions = prev ? prev.accepted + prev.dismissed : 0;
  const prevAcceptRate = prev && prevDecisions > 0 ? prev.accepted / prevDecisions : null;

  return {
    runs,
    decisions,
    accept_rate,
    dismiss_rate,
    avg_findings_per_run,
    avg_cost_usd,
    avg_latency_ms,
    cost_by_source: { provider: row.costProvider, estimated: row.costEstimated, unknown: row.costUnknown },
    low_sample: decisions < LOW_SAMPLE_THRESHOLD,
    // Deltas are null (not 0) when the agent has no prior-period row at all —
    // a brand new agent has no meaningful "change" to report (clarification #6).
    runs_delta: prev ? numericDelta(runs, prevRuns) : null,
    accept_rate_delta: prev ? numericDelta(accept_rate, prevAcceptRate) : null,
    cost_delta: prev ? numericDelta(row.totalCostUsd, prev.totalCostUsd) : null,
  };
}

function utcDayStart(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Zero-fill a sparse per-day run count into one entry per day in [from,to],
 *  oldest→newest — the sparkline series for `AgentPerfRow.trend`. */
export function dailyTrend(runsByDay: DayCount[], from: Date, to: Date): number[] {
  const byDay = new Map(runsByDay.map((d) => [d.day, d.count] as const));
  const out: number[] = [];
  const cursor = utcDayStart(from);
  const end = utcDayStart(to);
  while (cursor <= end) {
    out.push(byDay.get(cursor.toISOString().slice(0, 10)) ?? 0);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

/** Same bucketing, labelled with the ISO date — `AgentStats.trend`
 *  (`StatPoint[]`). */
export function dailyTrendPoints(runsByDay: DayCount[], from: Date, to: Date): { label: string; value: number }[] {
  const byDay = new Map(runsByDay.map((d) => [d.day, d.count] as const));
  const out: { label: string; value: number }[] = [];
  const cursor = utcDayStart(from);
  const end = utcDayStart(to);
  while (cursor <= end) {
    const label = cursor.toISOString().slice(0, 10);
    out.push({ label, value: byDay.get(label) ?? 0 });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

/** An agent with zero rows in the selected period — honest zeros/nulls, used
 *  by `agents/service.ts` when `performanceRows` returns no row at all
 *  (AC-4: distinct from a loading/error state, never an invented figure). */
export function emptyPerfSourceRow(agentId: string): PerfSourceRow {
  return {
    agentId,
    runsLocal: 0,
    runsCi: 0,
    countedRuns: 0,
    costedRuns: 0,
    timedRuns: 0,
    totalCostUsd: null,
    totalDurationMs: null,
    totalFindings: 0,
    lastRunAt: null,
    accepted: 0,
    dismissed: 0,
    pending: 0,
    costProvider: null,
    costEstimated: null,
    costUnknown: null,
    runsByDay: [],
  };
}
