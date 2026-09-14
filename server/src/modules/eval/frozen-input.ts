import type { EvalExpectation } from '@devdigest/shared';
import { groundFindings } from '@devdigest/reviewer-core';
import { parseUnifiedDiff } from '../../adapters/git/diff-parser.js';

/**
 * specs/12-eval-pipeline.md — pure helpers for a case's frozen input (D8/D16).
 * No I/O, no LLM. Used at case creation AND at edit (AC-13 re-validates a
 * changed expectation the same way).
 */

/**
 * finding 8 — a `pr_files.patch` is hunks only (no `diff --git`/`---`/`+++`
 * header), so `parseUnifiedDiff` (which keys files off the `+++ b/<path>`
 * line) can't parse it standalone. Synthesize a minimal, self-contained
 * unified diff around the stored patch so the frozen input round-trips
 * through the SAME parser the live review path uses.
 */
export function synthesizeFrozenDiff(path: string, patch: string): string {
  return `diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n${patch}`;
}

/**
 * finding 7 — AC-6's guard, built as a REUSE of `groundFindings`, never a
 * second definition of what a valid citation is (G5/D6). Builds a synthetic
 * `kind: 'finding'` Finding from the expectation (forcing the line-range
 * rule even for an expectation sourced from a full-file-kind finding, per
 * the spec's edge case) and checks it survives grounding against the
 * frozen diff.
 */
export function isExpectationGrounded(frozenDiff: string, expectation: EvalExpectation): boolean {
  const diff = parseUnifiedDiff(frozenDiff);
  const synthetic = {
    id: 'eval-expectation-check',
    severity: 'WARNING' as const,
    category: 'bug' as const,
    title: expectation.title ?? 'eval expectation',
    file: expectation.file,
    start_line: expectation.start_line,
    end_line: expectation.end_line,
    rationale: '',
    confidence: 1,
    kind: 'finding' as const,
  };
  const { kept } = groundFindings([synthetic], diff);
  return kept.length > 0;
}
