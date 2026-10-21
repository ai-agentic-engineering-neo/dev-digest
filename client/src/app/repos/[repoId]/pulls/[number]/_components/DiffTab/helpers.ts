/** Pure helpers for composing the Files changed tab from server + page data. */
import type { FindingRecord, PrFile, ReviewRecord, SmartDiffResponse } from "@devdigest/shared";

type Group = SmartDiffResponse["groups"][number];

/** Findings the server selected (ids in any file's `finding_ids`), in review order. */
export function displayedFindings(
  smartDiff: SmartDiffResponse | undefined,
  reviews: ReviewRecord[] | undefined,
): FindingRecord[] {
  if (!smartDiff || !reviews) return [];
  const ids = new Set(smartDiff.groups.flatMap((g) => g.files.flatMap((f) => f.finding_ids)));
  return reviews.flatMap((r) => r.findings).filter((f) => ids.has(f.id));
}

/** Attach each group path's patch text from the PR detail; unknown paths get `patch: null`. */
export function joinGroupFiles(group: Group, prFiles: PrFile[]): PrFile[] {
  const byPath = new Map(prFiles.map((f) => [f.path, f]));
  return group.files.map(
    (f) =>
      byPath.get(f.path) ?? {
        path: f.path,
        additions: f.additions,
        deletions: f.deletions,
        patch: null,
      },
  );
}

export interface DeepLinkTarget {
  path: string;
  line: number | null;
}

/**
 * The `file` / `line` query params as a diff target. The path must be a changed
 * file of this PR (never trusted otherwise); a line must be a positive integer.
 */
export function resolveDeepLink(
  files: PrFile[],
  file: string | null | undefined,
  line: string | null | undefined,
): DeepLinkTarget | null {
  if (!file || !files.some((f) => f.path === file)) return null;
  const n = line != null && /^\d+$/.test(line) ? Number(line) : NaN;
  return { path: file, line: Number.isSafeInteger(n) && n > 0 ? n : null };
}
