import type { Finding, Review, UnifiedDiff } from '@devdigest/shared';
import { parseDiff } from '../diff/parse.js';

/**
 * Reduce + slice helpers for map-reduce reviews. Pure (no DB / `this`), so they
 * live in the engine and are shared by the server and the CI runner.
 */

/**
 * Per-severity penalty subtracted from a perfect 100. Chosen so the score
 * tracks the findings the UI actually shows: 0 findings ⇒ 100, one suggestion
 * ⇒ 97, one warning ⇒ 88, one critical ⇒ 65.
 */
const SEVERITY_PENALTY: Record<Finding['severity'], number> = {
  CRITICAL: 35,
  WARNING: 12,
  SUGGESTION: 3,
};

/**
 * Deterministic 0–100 quality score derived from the (grounded) findings —
 * NOT the model's self-reported `score`, which has no anchor and drifts wildly
 * between models (a cheap model can "approve" with zero findings yet emit 10).
 * This mirrors how the review *event* is already computed from severities in
 * `to-review.ts`, so the number on screen can never contradict the findings
 * beneath it.
 *
 * Takes anything with a `severity`, so the server's PR list can score stored
 * finding rows (free-text severity) with this same formula; an unknown
 * severity costs nothing, as it counts in no severity bucket either.
 */
export function scoreFromFindings(findings: { severity: string }[]): number {
  const penalty = findings.reduce(
    (sum, f) => sum + (SEVERITY_PENALTY[f.severity as Finding['severity']] ?? 0),
    0,
  );
  return Math.max(0, Math.min(100, 100 - penalty));
}

/** Verdict severity order for the reduce step (worst verdict wins). */
const VERDICT_RANK: Record<string, number> = {
  request_changes: 2,
  comment: 1,
  approve: 0,
};

/**
 * Merge N partial Reviews (one per mapped file/chunk) into a single Review:
 * concat findings, take the worst verdict, mean score, joined summaries.
 */
export function reduceReviews(partials: Review[]): Review {
  if (partials.length === 1) return partials[0]!;
  const findings = partials.flatMap((p) => p.findings);
  let verdict: Review['verdict'] = 'approve';
  for (const p of partials) {
    if ((VERDICT_RANK[p.verdict] ?? 0) > (VERDICT_RANK[verdict] ?? 0)) verdict = p.verdict;
  }
  const score = partials.length
    ? Math.round(partials.reduce((s, p) => s + p.score, 0) / partials.length)
    : 0;
  const summary = partials.map((p) => p.summary).filter(Boolean).join(' ');
  return { verdict, score, summary, findings };
}

/**
 * Extract the slice of the unified diff for a single file (for map chunks).
 * Matches the parsed file whose path is EXACTLY `path` — not a substring, so
 * `x.ts` never also pulls in `sub/b/x.ts` the way matching on `b/${path}`
 * used to (L03).
 */
export function sliceDiff(diff: UnifiedDiff, path: string): string {
  const parsed = parseDiff(diff.raw);
  const file = parsed.files.find((f) => f.path === path);
  if (file) {
    const blockLines = parsed.lines.slice(file.start, file.end);
    const text = blockLines.map((l) => l.text).join('\n');
    // When the block's own last physical line is itself an empty string (a
    // real blank context/other line — not the last file in `diff.raw`), that
    // is otherwise indistinguishable, once re-split by `parseDiff`, from text
    // that merely ENDS in `\n`: `parseDiff` (parse.ts) deliberately drops that
    // as the whole-string trailing-newline artifact, silently eating the real
    // empty line underneath (F3). Appending one more `\n` restores the round
    // trip — `parseDiff` then drops ITS (correct) artifact instead and
    // recovers the real one. A non-empty last line is unaffected: `text`
    // already doesn't end in `\n`, so nothing changes for it.
    return blockLines.length > 0 && blockLines[blockLines.length - 1]!.text === '' ? text + '\n' : text;
  }
  // fallback: synthesize from the file's hunks (no matching block in `raw` —
  // e.g. a hand-built UnifiedDiff in a test)
  const f = diff.files.find((x) => x.path === path);
  if (!f) return diff.raw;
  return `diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}`;
}
