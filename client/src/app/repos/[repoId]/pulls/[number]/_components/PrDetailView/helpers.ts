import type { FindingRecord, PrMeta, ReviewRecord } from "@devdigest/shared";

/** The route is keyed by PR number but every PR API by row uuid — resolve it from the list. */
export function resolvePrId(pulls: PrMeta[] | undefined, number: string | number): string | null {
  return pulls?.find((p) => p.number === Number(number))?.id ?? null;
}

/** Every finding across all review runs (runs arrive newest-first). */
export function collectFindings(runs: ReviewRecord[]): FindingRecord[] {
  return runs.flatMap((r) => r.findings);
}

/** Findings flagged as a lethal trifecta (surfaced as a banner above the runs). */
export function selectLethalTrifecta(findings: FindingRecord[]): FindingRecord[] {
  return findings.filter((f) => f.kind === "lethal_trifecta");
}

/** The review produced by a given run, if any. */
export function findRun(runs: ReviewRecord[], runId: string | null): ReviewRecord | undefined {
  return runId ? runs.find((r) => r.run_id === runId) : undefined;
}
