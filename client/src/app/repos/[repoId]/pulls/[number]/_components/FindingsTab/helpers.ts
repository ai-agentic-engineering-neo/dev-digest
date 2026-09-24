import type { FindingRecord, ReviewRecord } from "@devdigest/shared";

/** run_id → that run's findings (reviews without a run are skipped). */
export function findingsByRunId(reviews: readonly ReviewRecord[]): Map<string, FindingRecord[]> {
  return new Map(reviews.flatMap((r) => (r.run_id ? [[r.run_id, r.findings] as const] : [])));
}

/** How many findings across all runs are Lethal Trifecta hits. */
export function lethalTrifectaCount(reviews: readonly ReviewRecord[]): number {
  return reviews.reduce((n, r) => n + r.findings.filter((f) => f.kind === "lethal_trifecta").length, 0);
}

/** The review whose panel owns j/k/a/d: the chosen one while it exists, else the newest. */
export function keyboardReviewId(reviews: readonly ReviewRecord[], chosenId: string | null): string | null {
  return reviews.some((r) => r.id === chosenId) ? chosenId : (reviews[0]?.id ?? null);
}
