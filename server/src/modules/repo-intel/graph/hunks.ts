/**
 * Patch → line ranges (plan 19 / P2-B). Pure.
 *
 * `pr_files.patch` is a unified diff of ONE file. We walk it line by line (not
 * just the `@@` headers) so the ranges cover exactly the removed lines (old
 * side, base coordinates) and the added lines (new side, head coordinates),
 * not the 3 context lines GitHub wraps around each change.
 *
 * Own copy on purpose: `modules/brief/hunks.ts` is a sibling module
 * (`no-cross-module`), and it only needs new-side ranges.
 */

export interface LineRange {
  /** 1-based, inclusive. */
  start: number;
  end: number;
}

export interface PatchRanges {
  /** Removed lines, in BASE (old) file coordinates. */
  removed: LineRange[];
  /** Added lines, in HEAD (new) file coordinates. A pure deletion adds nothing here: the base side (`removed`) carries it. */
  added: LineRange[];
}

const HUNK_HEADER = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

function push(ranges: LineRange[], line: number): void {
  const last = ranges[ranges.length - 1];
  if (last && last.end + 1 >= line && last.end <= line) {
    last.end = Math.max(last.end, line);
    return;
  }
  ranges.push({ start: line, end: line });
}

/** Empty ranges for a missing/binary/too-large patch (callers treat that as "whole file"). */
export function parsePatchRanges(patch: string | null | undefined): PatchRanges {
  const out: PatchRanges = { removed: [], added: [] };
  if (!patch) return out;

  let oldLine = 0;
  let newLine = 0;
  let inHunk = false;
  for (const line of patch.split('\n')) {
    const h = HUNK_HEADER.exec(line);
    if (h) {
      oldLine = Number(h[1]);
      newLine = Number(h[2]);
      inHunk = true;
      continue;
    }
    if (!inHunk) continue; // `--- a/x` / `+++ b/x` headers
    const c = line[0];
    if (c === '-') {
      push(out.removed, oldLine);
      oldLine += 1;
    } else if (c === '+') {
      push(out.added, newLine);
      newLine += 1;
    } else if (c === '\\') {
      // "\ No newline at end of file"
    } else {
      oldLine += 1;
      newLine += 1;
    }
  }
  return out;
}

export function rangesIntersect(a: LineRange, b: LineRange): boolean {
  return a.start <= b.end && a.end >= b.start;
}
