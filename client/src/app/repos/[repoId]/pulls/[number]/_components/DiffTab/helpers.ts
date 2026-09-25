/* Pure helpers for the Smart Diff tab (server/specs/06-smart-diff.md). */
import type { PrFile } from "@/lib/types";
import type { FindingRecord, PrReviewComment, ReviewRecord, SmartDiff, SmartDiffRole } from "@devdigest/shared";
import { countBySeverity, SEVERITY_LEVELS, type SeverityCount } from "@/components/findings-hover";

export interface FileGroup {
  role: SmartDiffRole;
  files: PrFile[];
  /** Findings on this group's files per severity (the header's coloured "● N"). */
  counts: SeverityCount[];
}

/**
 * The findings the diff shows: those of each agent's newest `review` — a re-run
 * of an agent replaces its earlier findings, other agents' stay (the same set
 * the server's smart-diff `finding_lines` and the PR list counts use).
 * `reviews` is newest-first, as GET /pulls/:id/reviews returns it.
 */
export function currentFindings(reviews: readonly ReviewRecord[] | undefined): FindingRecord[] {
  const seen = new Set<string | null>();
  const out: FindingRecord[] = [];
  for (const r of reviews ?? []) {
    if (r.kind !== "review" || seen.has(r.agent_id)) continue;
    seen.add(r.agent_id);
    out.push(...r.findings);
  }
  return out;
}

/**
 * Paths that carry a GitHub review comment or a current finding — in Smart
 * order only these file cards start expanded (the rest start collapsed).
 */
export function commentedPaths(
  comments: readonly Pick<PrReviewComment, "path">[] | undefined,
  findings: readonly Pick<FindingRecord, "file">[],
): Set<string> {
  return new Set([...(comments ?? []).map((c) => c.path), ...findings.map((f) => f.file)]);
}

/** 0 for CRITICAL, 1 for WARNING, 2 for SUGGESTION; files without findings sort last. */
function severityRank(findings: readonly Pick<FindingRecord, "severity">[]): number {
  let rank = SEVERITY_LEVELS.length;
  for (const f of findings) {
    const i = SEVERITY_LEVELS.indexOf(f.severity);
    if (i >= 0 && i < rank) rank = i;
  }
  return rank;
}

/**
 * Joins the PR's real files (patch content, GitHub order) to the smart-diff
 * response's role groups (path), in the server's fixed role order, dropping
 * empty groups. Inside a group the files with the most severe finding come
 * first (critical → warning → suggestion → none), otherwise the server's order
 * is kept. A file the smart-diff response doesn't know about yet (still
 * loading, or added after it was fetched) falls into `core` — never dropped.
 */
export function groupFiles(
  files: readonly PrFile[],
  smartDiff: SmartDiff | undefined,
  findings: readonly FindingRecord[] = [],
): FileGroup[] {
  const byPath = new Map(files.map((f) => [f.path, f]));
  const seen = new Set<string>();
  const buckets: { role: SmartDiffRole; files: PrFile[] }[] = [];

  for (const g of smartDiff?.groups ?? []) {
    const matched = g.files.filter((sf) => byPath.has(sf.path)).map((sf) => byPath.get(sf.path)!);
    for (const f of matched) seen.add(f.path);
    if (matched.length > 0) buckets.push({ role: g.role, files: matched });
  }

  const leftovers = files.filter((f) => !seen.has(f.path));
  if (leftovers.length > 0) {
    const core = buckets.find((g) => g.role === "core");
    if (core) core.files.push(...leftovers);
    else buckets.unshift({ role: "core", files: leftovers });
  }

  const byFile = new Map<string, FindingRecord[]>();
  for (const f of findings) byFile.set(f.file, [...(byFile.get(f.file) ?? []), f]);
  const rank = (path: string) => severityRank(byFile.get(path) ?? []);

  return buckets.map(({ role, files: groupFiles }) => ({
    role,
    // Array.prototype.sort is stable, so equal ranks keep the server's order.
    files: [...groupFiles].sort((a, b) => rank(a.path) - rank(b.path)),
    counts: countBySeverity(groupFiles.flatMap((f) => byFile.get(f.path) ?? [])),
  }));
}

/** "{files} files · +{additions} -{deletions}" summary numbers. */
export function totals(files: readonly PrFile[]): { files: number; additions: number; deletions: number } {
  return {
    files: files.length,
    additions: files.reduce((n, f) => n + (f.additions ?? 0), 0),
    deletions: files.reduce((n, f) => n + (f.deletions ?? 0), 0),
  };
}
