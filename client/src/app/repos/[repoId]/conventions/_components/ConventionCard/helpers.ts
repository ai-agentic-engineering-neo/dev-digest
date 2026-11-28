import type { ConventionCandidate, Repo } from "@devdigest/shared";
import { githubBlobUrl } from "@/lib/github-urls";
import { CONFIDENCE_COLOR, HIGH_CONFIDENCE, MEDIUM_CONFIDENCE } from "./constants";

/** Confidence 0..1 as a whole percent. */
export function confidencePercent(confidence: number): number {
  return Math.round(confidence * 100);
}

/** Bar colour for a confidence. */
export function confidenceColor(confidence: number): string {
  if (confidence >= HIGH_CONFIDENCE) return CONFIDENCE_COLOR.high;
  if (confidence >= MEDIUM_CONFIDENCE) return CONFIDENCE_COLOR.medium;
  return CONFIDENCE_COLOR.low;
}

/** GitHub link to the evidence lines on the repo's default branch, or null without a repo. */
export function evidenceUrl(
  repo: Pick<Repo, "full_name" | "default_branch"> | null,
  c: Pick<ConventionCandidate, "evidence_path" | "evidence_start_line" | "evidence_end_line">,
): string | null {
  if (!repo) return null;
  return githubBlobUrl(
    repo.full_name,
    repo.default_branch,
    c.evidence_path,
    c.evidence_start_line ?? undefined,
    c.evidence_end_line ?? undefined,
  );
}

/** Accept toggles accepted ↔ pending; reject toggles rejected ↔ pending. */
export function nextStatus(
  current: ConventionCandidate["status"],
  pressed: "accepted" | "rejected",
): ConventionCandidate["status"] {
  return current === pressed ? "pending" : pressed;
}
