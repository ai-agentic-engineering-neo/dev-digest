import type { PrFile, SmartDiffGroup, SmartDiffRole } from "@devdigest/shared";

export interface OrderedGroup {
  role: SmartDiffRole;
  files: PrFile[];
  flaggedCount: number;
}

/**
 * Keep the first file per path. `pr_files` can hold duplicate rows when two
 * `GET /pulls/:id` refreshes race (non-atomic delete + insert), and duplicate
 * paths break React keys in the diff viewer.
 */
export function uniqueByPath(files: PrFile[]): PrFile[] {
  const seen = new Set<string>();
  return files.filter((f) => (seen.has(f.path) ? false : (seen.add(f.path), true)));
}

/**
 * Join the server's role groups to the PR's files (which carry the patch).
 * Files keep GitHub order inside a group; server paths unknown to `files` are
 * dropped, and files no group mentions land in `core` so nothing goes missing.
 */
export function orderFilesByGroups(groups: SmartDiffGroup[], files: PrFile[]): OrderedGroup[] {
  const known = new Set(files.map((f) => f.path));
  const flagged = flaggedPathsOf(groups);
  const claimed = new Set<string>();
  for (const g of groups) for (const f of g.files) if (known.has(f.path)) claimed.add(f.path);

  const buckets = groups.map((g) => ({
    role: g.role,
    paths: new Set(g.files.map((f) => f.path)),
  }));
  const orphans = new Set(files.filter((f) => !claimed.has(f.path)).map((f) => f.path));
  if (orphans.size > 0) {
    const core = buckets.find((b) => b.role === "core");
    if (core) orphans.forEach((p) => core.paths.add(p));
    else buckets.unshift({ role: "core", paths: orphans });
  }

  // Filtering `files` (rather than mapping paths) keeps GitHub order and drops unknown paths.
  return buckets.map((b) => {
    const inGroup = files.filter((f) => b.paths.has(f.path));
    return {
      role: b.role,
      files: inGroup,
      flaggedCount: inGroup.filter((f) => flagged.has(f.path)).length,
    };
  });
}

/** Paths the server marked as carrying at least one finding line. */
export function flaggedPathsOf(groups: SmartDiffGroup[]): Set<string> {
  const set = new Set<string>();
  for (const g of groups) for (const f of g.files) if (f.finding_lines.length > 0) set.add(f.path);
  return set;
}

export function diffTotals(files: PrFile[]): { count: number; additions: number; deletions: number } {
  return {
    count: files.length,
    additions: files.reduce((n, f) => n + f.additions, 0),
    deletions: files.reduce((n, f) => n + f.deletions, 0),
  };
}
