import type { Finding, UnifiedDiff } from '@devdigest/shared';

/**
 * Citation grounding — the mandatory mechanical gate for diff-findings.
 *
 * A diff-finding is kept ONLY if its [start_line, end_line] range is valid
 * (start <= end, span capped) and contains a real new-side line of a hunk in the
 * unified diff for the same file. Findings that fail are dropped (the model
 * "hallucinated" a location). Spec: specs/grounding-model-findings.md.
 *
 * EXCEPTION (opt-in only): findings from server-side full-file scanners (hooks /
 * blast / onboarding) are not tied to a diff hunk. When the caller passes
 * `{ fullFileScanner: true }`, a finding whose `kind` is in FULL_FILE_KINDS only
 * requires its file to be present. Model output must never use this option:
 * `kind` is a model-controlled field.
 */

const FULL_FILE_KINDS = new Set(['secret_leak', 'lethal_trifecta', 'phantom', 'hook']);

/** Widest [start_line, end_line] span a finding may cite; wider spans are dropped. */
export const MAX_FINDING_SPAN_LINES = 500;

export interface GroundingOptions {
  /**
   * True only when the findings come from a server-side full-file scanner.
   * Default false: every finding is line-grounded whatever its `kind`.
   */
  fullFileScanner?: boolean;
}

export interface GroundingResult {
  kept: Finding[];
  dropped: { finding: Finding; reason: string }[];
}

/** Build a quick lookup of file → set of new-side line numbers covered by hunks. */
export function buildLineIndex(diff: UnifiedDiff): Map<string, Set<number>> {
  const idx = new Map<string, Set<number>>();
  for (const f of diff.files) {
    const set = new Set<number>();
    for (const h of f.hunks) {
      if (h.newLineNumbers && h.newLineNumbers.length > 0) {
        for (const n of h.newLineNumbers) set.add(n);
      } else {
        // fall back to the hunk's declared new range
        for (let n = h.newStart; n < h.newStart + Math.max(h.newLines, 1); n++) set.add(n);
      }
    }
    idx.set(f.path, set);
  }
  return idx;
}

/** Iterates the diff's lines (bounded by the diff), never the cited integer range. */
function rangeIntersects(lines: Set<number>, start: number, end: number): boolean {
  for (const n of lines) if (n >= start && n <= end) return true;
  return false;
}

/**
 * Apply the grounding gate to a set of findings against a unified diff.
 * Returns the kept findings and the dropped ones with reasons (for the trace).
 */
export function groundFindings(
  findings: Finding[],
  diff: UnifiedDiff,
  options: GroundingOptions = {},
): GroundingResult {
  const lineIndex = buildLineIndex(diff);
  const filesInDiff = new Set(diff.files.map((f) => f.path));
  const kept: Finding[] = [];
  const dropped: { finding: Finding; reason: string }[] = [];

  for (const finding of findings) {
    const isFullFile =
      options.fullFileScanner === true && finding.kind != null && FULL_FILE_KINDS.has(finding.kind);

    if (!filesInDiff.has(finding.file)) {
      dropped.push({ finding, reason: `file '${finding.file}' not present in diff` });
      continue;
    }

    if (isFullFile) {
      // full-file scanners only need the file to be in the diff
      kept.push(finding);
      continue;
    }

    const { start_line: start, end_line: end } = finding;
    if (start > end) {
      dropped.push({ finding, reason: `start_line ${start} is after end_line ${end}` });
      continue;
    }
    if (end - start + 1 > MAX_FINDING_SPAN_LINES) {
      dropped.push({
        finding,
        reason: `span of ${end - start + 1} lines exceeds ${MAX_FINDING_SPAN_LINES}`,
      });
      continue;
    }

    const lines = lineIndex.get(finding.file) ?? new Set<number>();
    if (rangeIntersects(lines, start, end)) {
      kept.push(finding);
    } else {
      dropped.push({
        finding,
        reason: `lines ${start}-${end} do not intersect any diff hunk in '${finding.file}'`,
      });
    }
  }

  return { kept, dropped };
}

/** Human-readable summary, e.g. "3/3 passed" used in run-trace stats. */
export function groundingSummary(result: GroundingResult): string {
  const total = result.kept.length + result.dropped.length;
  return `${result.kept.length}/${total} passed`;
}
