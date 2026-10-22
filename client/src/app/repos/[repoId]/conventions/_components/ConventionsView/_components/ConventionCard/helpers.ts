import type { ConventionCandidate, ConventionStatus } from "@devdigest/shared";

/** Confidence 0–1 → whole percent; null (unknown) → 0. */
export function confidencePct(confidence: number | null): number {
  return Math.round((confidence ?? 0) * 100);
}

/** Green for strong candidates, amber for the rest — mirrors the review UI's ok/warn palette. */
export function confidenceColor(pct: number): string {
  return pct >= 80 ? "var(--ok)" : "var(--warn)";
}

/** Clicking the active button undoes the decision (back to `pending`). */
export function nextStatus(current: ConventionStatus, clicked: "accepted" | "rejected"): ConventionStatus {
  return current === clicked ? "pending" : clicked;
}

/** `src/api/users.ts:23-31` (or `:23` for one line); null without evidence. */
export function evidenceLabel(c: Pick<ConventionCandidate, "evidence_path" | "evidence_start_line" | "evidence_end_line">): string | null {
  if (!c.evidence_path) return null;
  if (c.evidence_start_line == null) return c.evidence_path;
  const end = c.evidence_end_line != null && c.evidence_end_line !== c.evidence_start_line ? `-${c.evidence_end_line}` : "";
  return `${c.evidence_path}:${c.evidence_start_line}${end}`;
}
