import type { HunkRange } from './types.js';

const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

export interface LineRange {
  start: number;
  end: number;
}

/**
 * Parses the hunk headers of a unified-diff patch. Only the `@@ … @@` part is kept:
 * the text after the second `@@` is source code and must never reach the model.
 */
export function parseHunkRanges(patch: string | null): HunkRange[] {
  if (!patch) return [];
  const hunks: HunkRange[] = [];
  for (const line of patch.split('\n')) {
    const m = HUNK_HEADER.exec(line);
    if (!m) continue;
    hunks.push({
      header: m[0],
      oldStart: Number(m[1]),
      oldLines: m[2] === undefined ? 1 : Number(m[2]),
      newStart: Number(m[3]),
      newLines: m[4] === undefined ? 1 : Number(m[4]),
    });
  }
  return hunks;
}

/** New-side line ranges (hunks that add or keep at least one line), in hunk order. */
export function newSideRanges(hunks: readonly HunkRange[]): LineRange[] {
  return hunks
    .filter((h) => h.newLines > 0)
    .map((h) => ({ start: h.newStart, end: h.newStart + h.newLines - 1 }));
}

/**
 * Moves a line into the nearest new-side range (its FIRST line). No ranges => file-level, line 1.
 * Tie between two ranges => the earlier one.
 */
export function snapLine(
  line: number,
  ranges: readonly LineRange[],
): { line: number; fileLevel: boolean } {
  if (ranges.length === 0) return { line: 1, fileLevel: true };
  let best: LineRange | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const r of ranges) {
    if (line >= r.start && line <= r.end) return { line, fileLevel: false };
    const distance = line < r.start ? r.start - line : line - r.end;
    if (distance < bestDistance) {
      best = r;
      bestDistance = distance;
    }
  }
  return { line: best ? best.start : 1, fileLevel: false };
}

const FILE_REF = /^(.*?):(\d+)(?:-(\d+))?$/;

/** `path:12-18` / `path:12` / `path`; start/end only when >= 1. */
export function parseFileRef(ref: string): { path: string; start: number | null; end: number | null } {
  const trimmed = ref.trim();
  const m = FILE_REF.exec(trimmed);
  if (!m || m[1] === undefined || m[2] === undefined) return { path: trimmed, start: null, end: null };
  const start = Number(m[2]);
  if (start < 1) return { path: m[1].trim(), start: null, end: null };
  const end = m[3] === undefined ? null : Number(m[3]);
  return { path: m[1].trim(), start, end: end !== null && end >= start ? end : null };
}
