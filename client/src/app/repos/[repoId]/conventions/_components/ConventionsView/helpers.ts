import type { ConventionCandidate } from "@devdigest/shared";
import { CONFIDENCE_OK, CONFIDENCE_WARN } from "./constants";

/** `src/a.ts:23-31` (or `:23` for one line) — same format as the server's skill body. */
export function evidenceRef(c: Pick<ConventionCandidate, "evidence_path" | "line_start" | "line_end">): string {
  if (c.line_start == null) return c.evidence_path;
  const range = c.line_end != null && c.line_end !== c.line_start ? `${c.line_start}-${c.line_end}` : `${c.line_start}`;
  return `${c.evidence_path}:${range}`;
}

/** Bar colour for a 0..1 confidence (design: green / amber / red). */
export function confidenceColor(confidence: number): string {
  if (confidence >= CONFIDENCE_OK) return "var(--ok)";
  if (confidence >= CONFIDENCE_WARN) return "var(--warn)";
  return "var(--crit)";
}

export function countAccepted(list: ConventionCandidate[]): number {
  return list.filter((c) => c.status === "accepted").length;
}

/** Clicking the "Accepted" button again un-accepts (back to pending). */
export function nextStatusOnAccept(c: ConventionCandidate): ConventionCandidate["status"] {
  return c.status === "accepted" ? "pending" : "accepted";
}

export function nextStatusOnReject(c: ConventionCandidate): ConventionCandidate["status"] {
  return c.status === "rejected" ? "pending" : "rejected";
}
