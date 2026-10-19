import type { ConventionCandidate, Repo } from "@devdigest/shared";
import { githubBlobUrl } from "@/lib/github-urls";
import { CONFIDENCE_OK, CONFIDENCE_WARN } from "./constants";

/** `path:line` (or just the path for a hand-written candidate). */
export function evidenceLabel(c: Pick<ConventionCandidate, "evidence_path" | "evidence_line">): string {
  return c.evidence_line != null ? `${c.evidence_path}:${c.evidence_line}` : c.evidence_path;
}

/** GitHub blob link on the repo's default branch; none until the repo is known. */
export function evidenceHref(
  repo: Pick<Repo, "full_name" | "default_branch"> | null,
  c: Pick<ConventionCandidate, "evidence_path" | "evidence_line">,
): string | undefined {
  if (!repo || !c.evidence_path) return undefined;
  return githubBlobUrl(repo.full_name, repo.default_branch, c.evidence_path, c.evidence_line ?? undefined);
}

/** Same thresholds as ConfidenceNum: ≥85 ok, ≥65 warn, else muted. */
export function confidenceColor(pct: number): string {
  return pct >= CONFIDENCE_OK ? "var(--ok)" : pct >= CONFIDENCE_WARN ? "var(--warn)" : "var(--text-muted)";
}
