import type { FindingRecord, ReviewRecord } from "@devdigest/shared";

/** Every finding across a PR's review runs; reviews arrive newest-run-first. */
export function collectFindings(reviews: ReviewRecord[] | undefined): FindingRecord[] {
  return (reviews ?? []).flatMap((r) => r.findings);
}

/** The subset flagged as a lethal-trifecta prompt-injection risk. */
export function lethalTrifectaFindings(findings: FindingRecord[]): FindingRecord[] {
  return findings.filter((f) => f.kind === "lethal_trifecta");
}
