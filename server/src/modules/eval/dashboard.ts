import type {
  EvalDashboard,
  EvalRunRecord,
  EvalTrendPoint,
} from '@devdigest/shared/contracts/eval-ci';
import type { EvalRepository, EvalRunRow } from './repository.js';
import { RECENT_RUNS_LIMIT, REGRESSION_THRESHOLD } from './constants.js';
import { round } from './helpers.js';

export function runToRecord(r: EvalRunRow, caseName?: string): EvalRunRecord {
  return {
    id: r.id,
    case_id: r.caseId,
    case_name: caseName ?? null,
    ran_at: r.ranAt.toISOString(),
    actual_output: r.actualOutput,
    pass: r.pass,
    recall: r.recall,
    precision: r.precision,
    citation_accuracy: r.citationAccuracy,
    duration_ms: r.durationMs,
    cost_usd: r.costUsd,
  };
}

export async function dashboard(
  repo: EvalRepository,
  workspaceId: string,
  filter?: { ownerKind?: 'agent' | 'skill'; ownerId?: string },
): Promise<EvalDashboard> {
  const cases = await repo.listCases(workspaceId, filter);
  const runs = await repo.runsForCases(cases.map((c) => c.id));
  const caseName = new Map(cases.map((c) => [c.id, c.name]));

  // chronological (oldest → newest) for the trend line
  const chrono = [...runs].sort((a, b) => a.ranAt.getTime() - b.ranAt.getTime());
  const trend: EvalTrendPoint[] = chrono.map((r) => ({
    ran_at: r.ranAt.toISOString(),
    recall: r.recall ?? 0,
    precision: r.precision ?? 0,
    citation_accuracy: r.citationAccuracy ?? 0,
    pass_rate: r.pass ? 1 : 0,
    cost_usd: r.costUsd ?? null,
  }));

  // "current" = mean of the most-recent run per case
  const latestByCase = new Map<string, EvalRunRow>();
  for (const r of runs) if (!latestByCase.has(r.caseId)) latestByCase.set(r.caseId, r); // newest first
  const latest = [...latestByCase.values()];
  const meanOf = (sel: (r: EvalRunRow) => number | null) =>
    latest.length ? latest.reduce((s, r) => s + (sel(r) ?? 0), 0) / latest.length : 0;

  const current = {
    recall: meanOf((r) => r.recall),
    precision: meanOf((r) => r.precision),
    citation_accuracy: meanOf((r) => r.citationAccuracy),
    traces_passed: latest.filter((r) => r.pass).length,
    traces_total: latest.length,
    cost_usd: latest.reduce<number | null>(
      (s, r) => (s == null || r.costUsd == null ? null : s + r.costUsd),
      0,
    ),
  };

  // delta = current vs the previous run's metrics (last two trend points)
  const prev = trend.length >= 2 ? trend[trend.length - 2]! : null;
  const last = trend.length >= 1 ? trend[trend.length - 1]! : null;
  const delta = {
    recall: last && prev ? round(last.recall - prev.recall) : 0,
    precision: last && prev ? round(last.precision - prev.precision) : 0,
    citation_accuracy: last && prev ? round(last.citation_accuracy - prev.citation_accuracy) : 0,
  };

  const alert =
    delta.precision < REGRESSION_THRESHOLD
      ? `Precision dropped ${Math.round(Math.abs(delta.precision) * 100)}pts on the latest run — review for new false positives.`
      : delta.recall < REGRESSION_THRESHOLD
        ? `Recall dropped ${Math.round(Math.abs(delta.recall) * 100)}pts on the latest run — a regression may be missing findings.`
        : null;

  return {
    owner_kind: filter?.ownerKind ?? null,
    owner_id: filter?.ownerId ?? null,
    cases_total: cases.length,
    current,
    delta,
    trend,
    recent_runs: runs.slice(0, RECENT_RUNS_LIMIT).map((r) => runToRecord(r, caseName.get(r.caseId))),
    alert,
  };
}
