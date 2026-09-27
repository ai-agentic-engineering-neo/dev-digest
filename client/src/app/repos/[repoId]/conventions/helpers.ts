import type { ConventionCandidate, ConventionDiscarded, ConventionScan } from "@devdigest/shared";

/** Pure helpers for the Conventions screen. */

/** `path:12-18`, or `path:12` when the evidence is a single line. */
export function evidenceRef(c: ConventionCandidate): string {
  if (c.evidence_line_start == null) return c.evidence_path;
  const { evidence_line_start: start, evidence_line_end: end } = c;
  return end != null && end !== start
    ? `${c.evidence_path}:${start}-${end}`
    : `${c.evidence_path}:${start}`;
}

/** Confidence as a whole percent — the number the card shows. */
export function confidencePct(confidence: number): number {
  return Math.round(confidence * 100);
}

/** Green above 85, amber above 60, muted below — the card's confidence bar. */
export function confidenceColor(confidence: number): string {
  const pct = confidencePct(confidence);
  if (pct >= 85) return "var(--ok)";
  if (pct >= 60) return "var(--warn)";
  return "var(--text-muted)";
}

/** How many of the model's proposals the verifier threw away. */
export function discardedTotal(discarded: ConventionDiscarded | undefined): number {
  if (!discarded) return 0;
  return Object.values(discarded).reduce((sum, n) => sum + (Number(n) || 0), 0);
}

export interface CandidateBuckets {
  pending: ConventionCandidate[];
  accepted: ConventionCandidate[];
  rejected: ConventionCandidate[];
}

/** Split candidates by status; the server already sorted them. */
export function bucketCandidates(candidates: ConventionCandidate[]): CandidateBuckets {
  return {
    pending: candidates.filter((c) => c.status === "pending"),
    accepted: candidates.filter((c) => c.status === "accepted"),
    rejected: candidates.filter((c) => c.status === "rejected"),
  };
}

/** True while a scan is in flight — the state that disables both buttons. */
export function isScanning(scan: ConventionScan | null | undefined): boolean {
  return scan?.status === "running";
}

/**
 * Relative age of the last scan, in the coarse units a header needs.
 * Returns null when there is nothing to date.
 */
export function scanAge(scan: ConventionScan | null | undefined, now: number = Date.now()): { unit: "minute" | "hour" | "day"; value: number } | null {
  const iso = scan?.finished_at ?? scan?.started_at;
  if (!iso) return null;
  const ms = now - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return { unit: "minute", value: Math.max(1, minutes) };
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return { unit: "hour", value: hours };
  return { unit: "day", value: Math.floor(hours / 24) };
}
