import type { SkillStatsCategory } from '@devdigest/shared';

/**
 * A1 — pure S10 arithmetic. Repository methods hand back raw rows/counts;
 * these functions turn them into the DTO's rate/count fields. No I/O.
 *
 * Rule (S10, stated once for the whole module): every rate/count field here is
 * `null` when its denominator is 0 — "no data" — never a silent 0 standing in
 * for it. A genuine zero (e.g. the skill was used but nothing was ever
 * flagged) is reported as 0, because THAT denominator (the used-run count) is
 * nonzero.
 */

export interface FindingStatRow {
  category: string;
  acceptedAt: Date | null;
  dismissedAt: Date | null;
}

export interface FindingStats {
  findingsCount: number;
  acceptRate: number | null;
  byCategory: SkillStatsCategory[];
}

/** accept_rate + findings_30d + by_category, all over the SAME findings rows. */
export function computeFindingStats(rows: FindingStatRow[]): FindingStats {
  const accepted = rows.filter((r) => r.acceptedAt !== null).length;
  const considered = rows.filter((r) => r.acceptedAt !== null || r.dismissedAt !== null).length;

  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.category, (counts.get(r.category) ?? 0) + 1);

  return {
    findingsCount: rows.length,
    acceptRate: considered === 0 ? null : accepted / considered,
    byCategory: [...counts.entries()].map(([category, count]) => ({ category, count })),
  };
}

/** pull_rate = (runs whose trace used the skill) / (all runs by agents linked to it). */
export function computePullRate(usedRunCount: number, totalRunCount: number): number | null {
  return totalRunCount === 0 ? null : usedRunCount / totalRunCount;
}
