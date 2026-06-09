import type { Finding, EvalRun } from '@devdigest/shared';
import { normPath, round } from './helpers.js';

/**
 * Compute recall/precision/citation. An expected finding is "matched" when an
 * actual finding hits the same file and an overlapping line (or same title,
 * case-insensitive). Citation = fraction of *all* model findings that survived
 * grounding (groundedCount / rawCount).
 */
export function score(
  expected: Partial<Finding>[],
  actual: Finding[],
  rawCount: number,
): { recall: number; precision: number; citation_accuracy: number } {
  if (expected.length === 0 && actual.length === 0) {
    return { recall: 1, precision: 1, citation_accuracy: 1 };
  }
  const usedActual = new Set<number>();
  let matched = 0;
  for (const e of expected) {
    const idx = actual.findIndex((a, i) => !usedActual.has(i) && findingMatches(e, a));
    if (idx >= 0) {
      usedActual.add(idx);
      matched += 1;
    }
  }
  const recall = expected.length ? matched / expected.length : actual.length === 0 ? 1 : 0;
  const precision = actual.length ? matched / actual.length : expected.length === 0 ? 1 : 0;
  const citation = rawCount ? actual.length / rawCount : 1;
  return {
    recall: round(recall),
    precision: round(precision),
    citation_accuracy: round(citation),
  };
}

export function findingMatches(e: Partial<Finding>, a: Finding): boolean {
  const sameFile = e.file ? normPath(e.file) === normPath(a.file) : true;
  if (!sameFile) return false;
  // line overlap when an expected line is provided
  if (typeof e.start_line === 'number') {
    const eStart = e.start_line;
    const eEnd = typeof e.end_line === 'number' ? e.end_line : e.start_line;
    const overlap = a.start_line <= eEnd && a.end_line >= eStart;
    if (overlap) return true;
  }
  // title match (case-insensitive substring either way)
  if (e.title) {
    const et = e.title.toLowerCase();
    const at = a.title.toLowerCase();
    if (at.includes(et) || et.includes(at)) return true;
  }
  // category + severity match as a weaker signal when no line/title given
  if (!e.start_line && !e.title) {
    return (
      (!e.severity || e.severity === a.severity) && (!e.category || e.category === a.category)
    );
  }
  return false;
}

/** Merge per-case EvalRuns into one (means over cases; sums for traces/cost). */
export function aggregate(runs: EvalRun[]): EvalRun {
  const n = runs.length || 1;
  const mean = (sel: (r: EvalRun) => number) => runs.reduce((s, r) => s + sel(r), 0) / n;
  const cost = runs.reduce<number | null>(
    (s, r) => (s == null || r.cost_usd == null ? null : s + r.cost_usd),
    0,
  );
  return {
    recall: mean((r) => r.recall),
    precision: mean((r) => r.precision),
    citation_accuracy: mean((r) => r.citation_accuracy),
    traces_passed: runs.reduce((s, r) => s + r.traces_passed, 0),
    traces_total: runs.reduce((s, r) => s + r.traces_total, 0),
    duration_ms: runs.reduce((s, r) => s + r.duration_ms, 0),
    cost_usd: cost,
    per_trace: runs.flatMap((r) => r.per_trace),
  };
}
