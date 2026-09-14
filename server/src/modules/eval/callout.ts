import type { EvalCallout, EvalRun } from '@devdigest/shared';

/**
 * specs/12-eval-pipeline.md D12/AC-45 — the dashboard/detail callout is
 * DERIVED, never narrated (N1). The first clause (metric/direction/
 * magnitude/version) is always computable; the causal clause (named case
 * transitions) is emitted ONLY when the run data actually shows one —
 * never a model-authored guess.
 */

type Metric = 'recall' | 'precision' | 'citation_accuracy';
const METRICS: Metric[] = ['recall', 'precision', 'citation_accuracy'];

/**
 * `latest`/`previous` are the two most recent COMPLETED runs' metrics
 * (`EvalRun`), each paired with the agent version that produced it.
 * Returns null when fewer than two comparable runs exist, or when every
 * metric is `null` in one of them (nothing to compare — AC-20's "not
 * applicable" propagates to "nothing to call out", not a fake 0-magnitude
 * move).
 */
export function buildCallout(
  latest: { metrics: EvalRun; agentVersion: number | null },
  previous: { metrics: EvalRun },
): EvalCallout | null {
  let best: { metric: Metric; delta: number } | null = null;
  for (const metric of METRICS) {
    const a = previous.metrics[metric];
    const b = latest.metrics[metric];
    if (a == null || b == null) continue;
    const delta = b - a;
    if (best === null || Math.abs(delta) > Math.abs(best.delta)) {
      best = { metric, delta };
    }
  }
  if (best === null) return null;

  const previousByCaseId = new Map(previous.metrics.per_case.map((c) => [c.case_id, c]));
  const case_transitions = latest.metrics.per_case.flatMap((c) => {
    if (c.status !== 'scored' || c.pass === null) return [];
    const prior = previousByCaseId.get(c.case_id);
    if (!prior || prior.status !== 'scored' || prior.pass === null) return [];
    if (prior.pass === c.pass) return [];
    return [{ case_id: c.case_id, name: c.name, from: prior.pass, to: c.pass }];
  });

  return {
    metric: best.metric,
    direction: best.delta >= 0 ? 'up' : 'down',
    magnitude: Math.abs(best.delta),
    agent_version: latest.agentVersion,
    case_transitions,
  };
}
