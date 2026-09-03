import type { Finding, UnifiedDiff } from '@devdigest/shared';

/**
 * Citation grounding — the mandatory mechanical gate for diff-findings.
 *
 * A diff-finding is kept ONLY if its [start_line, end_line] range intersects a
 * real hunk in the unified diff for the same file. Findings that fail are
 * dropped (the model "hallucinated" a location).
 *
 * EXCEPTION: findings from full-file scanners (hooks / blast / onboarding) are
 * not tied to a diff hunk — they ground against the file existing in the diff
 * (or are exempted entirely). We treat `kind` in {secret_leak, lethal_trifecta,
 * phantom, hook} as full-file: they only require the file to be present.
 */

const FULL_FILE_KINDS = new Set(['secret_leak', 'lethal_trifecta', 'phantom', 'hook']);

/**
 * Findings below this self-reported confidence are dropped outright. Every
 * reviewer system prompt already tells the model "if you would dismiss your
 * own finding as a likely false positive, do not report it" — this is the
 * mechanical backstop for when the model reports one anyway (seen live: a
 * CRITICAL "secret committed" finding shipped at confidence 0.1, with the
 * model's own rationale concluding it probably isn't one).
 */
const CONFIDENCE_FLOOR = 0.3;

export interface GroundingResult {
  kept: Finding[];
  dropped: { finding: Finding; reason: string }[];
}

/**
 * A `lethal_trifecta` finding's own system prompt requires it to name all
 * three components (untrusted_input, private_data_access, exfil_path) with a
 * concrete file:line EACH before it may be reported — "only set kind to
 * lethal_trifecta when you can name all three components with a concrete
 * file:line for each." Enforce that mechanically instead of trusting the
 * model's self-report: a trifecta claim is dropped as ungrounded, not merely
 * downgraded, unless EVERY declared component has an evidence entry whose
 * file:line is a REAL citation — present in the diff, same bar as an
 * ordinary finding's own location. A model can satisfy "provide an entry per
 * component" with fabricated file:line pairs just as easily as it can invent
 * a location for a normal finding; checking presence alone would not have
 * caught that, so each entry is citation-checked exactly like a diff-finding.
 */
function hasCompleteTrifectaEvidence(
  finding: Finding,
  filesInDiff: Set<string>,
  lineIndex: Map<string, Set<number>>,
): boolean {
  const components = finding.trifecta_components ?? [];
  if (components.length === 0) return false;
  const evidence = finding.evidence ?? [];
  const verifiedComponents = new Set(
    evidence
      .filter((e) => filesInDiff.has(e.file) && (lineIndex.get(e.file) ?? new Set()).has(e.line))
      .map((e) => e.component),
  );
  return components.every((c) => verifiedComponents.has(c));
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

function rangeIntersects(lines: Set<number>, start: number, end: number): boolean {
  const lo = Math.min(start, end);
  const hi = Math.max(start, end);
  for (let n = lo; n <= hi; n++) if (lines.has(n)) return true;
  return false;
}

/**
 * Apply the grounding gate to a set of findings against a unified diff.
 * Returns the kept findings and the dropped ones with reasons (for the trace).
 */
export function groundFindings(findings: Finding[], diff: UnifiedDiff): GroundingResult {
  const lineIndex = buildLineIndex(diff);
  const filesInDiff = new Set(diff.files.map((f) => f.path));
  const kept: Finding[] = [];
  const dropped: { finding: Finding; reason: string }[] = [];

  for (const finding of findings) {
    const isFullFile = finding.kind ? FULL_FILE_KINDS.has(finding.kind) : false;

    if (finding.confidence < CONFIDENCE_FLOOR) {
      dropped.push({
        finding,
        reason: `confidence ${finding.confidence} below floor ${CONFIDENCE_FLOOR}`,
      });
      continue;
    }

    if (!filesInDiff.has(finding.file)) {
      dropped.push({ finding, reason: `file '${finding.file}' not present in diff` });
      continue;
    }

    if (
      finding.kind === 'lethal_trifecta' &&
      !hasCompleteTrifectaEvidence(finding, filesInDiff, lineIndex)
    ) {
      dropped.push({
        finding,
        reason: 'lethal_trifecta claim missing file:line evidence for a declared component',
      });
      continue;
    }

    if (isFullFile) {
      // full-file scanners only need the file to be in the diff
      kept.push(finding);
      continue;
    }

    const lines = lineIndex.get(finding.file) ?? new Set<number>();
    if (rangeIntersects(lines, finding.start_line, finding.end_line)) {
      kept.push(finding);
    } else {
      dropped.push({
        finding,
        reason: `lines ${finding.start_line}-${finding.end_line} do not intersect any diff hunk in '${finding.file}'`,
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
