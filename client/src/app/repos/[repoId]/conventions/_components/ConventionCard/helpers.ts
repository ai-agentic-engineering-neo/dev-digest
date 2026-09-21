/** Pure helpers for a convention candidate card. No hooks, no fetch. */

import { CONFIDENCE_OK, CONFIDENCE_WARN } from "./constants";

/** 0-1 confidence as a whole percent (0.9 -> 90). */
export function confidencePercent(confidence: number): number {
  return Math.round(Math.max(0, Math.min(1, confidence)) * 100);
}

/** Bar colour for a confidence score. */
export function confidenceColor(confidence: number): string {
  if (confidence >= CONFIDENCE_OK) return "var(--ok)";
  if (confidence >= CONFIDENCE_WARN) return "var(--warn)";
  return "var(--text-muted)";
}

/** `src/api/users.ts` + line 23 -> `src/api/users.ts:23` (line is optional). */
export function evidenceLabel(path: string, line?: number | null): string {
  return line ? `${path}:${line}` : path;
}

/**
 * Deep link to the evidence on GitHub: `.../blob/<branch>/<path>#L<line>`.
 *
 * The branch, not a sha, because the extractor samples the working tree at
 * whatever the clone is synced to and no scan sha is persisted. The snippet on
 * the card stays the authoritative evidence if the file later moves.
 *
 * Returns null when the repo is unknown or the path is empty, so the caller
 * renders plain text instead of a dead link.
 */
export function githubEvidenceUrl(
  fullName: string | undefined,
  branch: string | undefined,
  path: string,
  line?: number | null,
): string | null {
  if (!fullName || !path) return null;
  const ref = branch || "HEAD";
  const segments = path.split("/").map(encodeURIComponent).join("/");
  const anchor = line ? `#L${line}` : "";
  return `https://github.com/${fullName}/blob/${encodeURIComponent(ref)}/${segments}${anchor}`;
}
