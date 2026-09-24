/* Pure helpers for the Smart Diff tab (server/specs/06-smart-diff.md). */
import type { PrFile } from "@/lib/types";
import type { SmartDiff, SmartDiffFile, SmartDiffRole } from "@devdigest/shared";

export interface FileGroup {
  role: SmartDiffRole;
  files: PrFile[];
  /** How many of this group's files have at least one finding (the header's "● N"). */
  flaggedCount: number;
}

/** How many of `files` have at least one finding line. */
export function flaggedCount(files: readonly Pick<SmartDiffFile, "finding_lines">[]): number {
  return files.filter((f) => f.finding_lines.length > 0).length;
}

/**
 * Joins the PR's real files (patch content, GitHub order) to the smart-diff
 * response's role groups (path, finding_lines), in the server's fixed role
 * order, dropping empty groups. A file the smart-diff response doesn't know
 * about yet (still loading, or added after it was fetched) falls into `core`
 * — never dropped.
 */
export function groupFiles(files: readonly PrFile[], smartDiff: SmartDiff | undefined): FileGroup[] {
  const byPath = new Map(files.map((f) => [f.path, f]));
  const seen = new Set<string>();
  const groups: FileGroup[] = [];

  for (const g of smartDiff?.groups ?? []) {
    const matched = g.files.filter((sf) => byPath.has(sf.path));
    for (const sf of matched) seen.add(sf.path);
    const groupFiles = matched.map((sf) => byPath.get(sf.path)!);
    if (groupFiles.length > 0) groups.push({ role: g.role, files: groupFiles, flaggedCount: flaggedCount(matched) });
  }

  const leftovers = files.filter((f) => !seen.has(f.path));
  if (leftovers.length > 0) {
    const core = groups.find((g) => g.role === "core");
    if (core) core.files.push(...leftovers);
    else groups.unshift({ role: "core", files: leftovers, flaggedCount: 0 });
  }
  return groups;
}

/** "{files} files · +{additions} -{deletions}" summary numbers. */
export function totals(files: readonly PrFile[]): { files: number; additions: number; deletions: number } {
  return {
    files: files.length,
    additions: files.reduce((n, f) => n + (f.additions ?? 0), 0),
    deletions: files.reduce((n, f) => n + (f.deletions ?? 0), 0),
  };
}
