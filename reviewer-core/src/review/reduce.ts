import type { Finding, Review, UnifiedDiff } from '@devdigest/shared';

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
 */
export function scoreFromFindings(findings: Finding[]): number {
  const penalty = findings.reduce((sum, f) => sum + (SEVERITY_PENALTY[f.severity] ?? 0), 0);
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
 * Parse the two paths of a `diff --git a/X b/Y` header. Handles git's quoted
 * form (`"a/my dir/f.ts" "b/my dir/f.ts"`, used for spaces/special chars;
 * only `\"` and `\\` escapes are decoded). For unquoted paths containing
 * spaces the split is ambiguous; we pick the split where both sides are equal
 * (the non-rename case) and otherwise the first ` b/`.
 */
function parseDiffGitHeader(line: string): { a: string; b: string } | null {
  const rest = line.slice('diff --git '.length);
  const quoted = rest.match(/^"((?:[^"\\]|\\.)*)"\s+"((?:[^"\\]|\\.)*)"$/);
  const unq = (s: string) => s.replace(/\\(["\\])/g, '$1');
  let a: string;
  let b: string;
  if (quoted) {
    a = unq(quoted[1]!);
    b = unq(quoted[2]!);
  } else {
    const half = (rest.length - 1) / 2;
    if (Number.isInteger(half) && rest[half] === ' ' && rest.slice(2, half) === rest.slice(half + 3)) {
      a = rest.slice(0, half);
      b = rest.slice(half + 1);
    } else {
      const sep = rest.indexOf(' b/');
      if (sep < 0) return null;
      a = rest.slice(0, sep);
      b = rest.slice(sep + 1);
    }
  }
  if (!a.startsWith('a/') || !b.startsWith('b/')) return null;
  return { a: a.slice(2), b: b.slice(2) };
}

/**
 * Extract the slice of the unified diff for a single file (for map chunks).
 * Matches the `diff --git` header path exactly (new `b/` path first, old `a/`
 * path as a fallback for renames/deletions) — never by substring, so
 * `src/a.ts` does not also capture `src/a.tsx`.
 */
export function sliceDiff(diff: UnifiedDiff, path: string): string {
  const lines = diff.raw.split('\n');
  const sections: { a: string; b: string; start: number; end: number }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (!line.startsWith('diff --git ')) continue;
    const last = sections[sections.length - 1];
    if (last) last.end = i;
    const parsed = parseDiffGitHeader(line) ?? { a: '', b: '' };
    sections.push({ ...parsed, start: i, end: lines.length });
  }
  const hit = sections.find((s) => s.b === path) ?? sections.find((s) => s.a === path);
  if (hit) return lines.slice(hit.start, hit.end).join('\n');

  // fallback: rebuild hunk headers from the parsed file (raw body unavailable)
  const f = diff.files.find((x) => x.path === path);
  if (!f) return diff.raw;
  const hunks = f.hunks.map(
    (h) => `@@ -${h.oldStart},${h.oldLines} +${h.newStart},${h.newLines} @@`,
  );
  return [`diff --git a/${path} b/${path}`, `--- a/${path}`, `+++ b/${path}`, ...hunks].join('\n');
}
