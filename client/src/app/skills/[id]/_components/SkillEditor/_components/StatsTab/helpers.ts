import type { CountBy } from "@devdigest/shared";

/** Largest count of a breakdown (≥ 1, so bar widths never divide by zero). */
export function maxCount(rows: readonly CountBy[]): number {
  return Math.max(1, ...rows.map((r) => r.count));
}

/** Whether the skill was never in a run's prompt within the window. */
export function neverAttached(runsAttached: number): boolean {
  return runsAttached === 0;
}
