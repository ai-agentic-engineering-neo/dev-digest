/**
 * Pure hunk-range extraction (Q2, plans/11-why-risk-brief.md). Scans a
 * unified-diff `patch` string for `@@ -a,b +c,d @@` HEADER lines only — never
 * a line of hunk body (AC-2 by construction: the regex only matches lines
 * that begin with `@@`, which a hunk body line never does).
 *
 * Deliberately NOT `adapters/git/diff-parser.ts`'s `parseUnifiedDiff` —
 * `server/LEARNINGS.md:112-129` records that it silently drops binary files,
 * pure renames and deletions. This feature's changed-file set must be the
 * persisted `pr_files` rows themselves (Q2), with this module doing its own
 * five-line header scan per row.
 */

export interface HunkRange {
  /** 1-based, inclusive, in NEW-file line numbers (the `+c,d` half of the
   *  header) — matches what a citation's `line` field means everywhere else
   *  in this feature. */
  start: number;
  end: number;
}

/** `@@ -oldStart[,oldLines] +newStart[,newLines] @@` — only the `+` half is
 *  needed; a hunk with an omitted count is exactly 1 line (unified diff
 *  convention). */
const HUNK_HEADER_RE = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm;

/** A row whose `patch` is `null` or has no header line contributes zero
 *  ranges — every citation against it correctly degrades to file-only under
 *  AC-20 (Q2's documented, expected outcome for the seeded PR #482). */
export function hunkRangesFor(patch: string | null): HunkRange[] {
  if (!patch) return [];
  const ranges: HunkRange[] = [];
  HUNK_HEADER_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = HUNK_HEADER_RE.exec(patch))) {
    const start = Number(m[1]);
    const lines = m[2] !== undefined ? Number(m[2]) : 1;
    ranges.push({ start, end: start + lines - 1 });
  }
  return ranges;
}

/** AC-20: a line must fall inside one of the file's hunk ranges to survive as
 *  a line-level citation. */
export function lineInRanges(line: number, ranges: readonly HunkRange[]): boolean {
  return ranges.some((r) => line >= r.start && line <= r.end);
}
