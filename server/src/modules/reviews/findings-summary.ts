import type { FindingPreview, FindingsSummary, Severity } from '@devdigest/shared';
import * as t from '../../db/schema.js';

/**
 * Findings rollup for the PR list's FINDINGS column and the timeline badges
 * (pure — no DB / `this`, so it unit-tests cleanly).
 *
 * Folds persisted finding rows into a per-key (prId / runId) severity breakdown
 * plus a trimmed preview list for the hover tooltip. Dismissed findings are
 * excluded — the labels reflect what is still open on the PR. Rationale is cut
 * to a snippet so the list payload never carries full markdown for every row.
 */

export const RATIONALE_PREVIEW_MAX = 240;

const SEVERITY_RANK: Record<Severity, number> = { CRITICAL: 0, WARNING: 1, SUGGESTION: 2 };

export interface FindingSummaryRow {
  key: string | null;
  id: string;
  severity: string;
  category: string;
  title: string;
  file: string;
  startLine: number;
  endLine: number;
  confidence: number;
  rationale: string;
  dismissedAt: Date | null;
}

/** Drizzle select for a `FindingSummaryRow` minus `key` — callers add the key
 *  column (prId / runId) they group by. */
export const findingSummaryColumns = {
  id: t.findings.id,
  severity: t.findings.severity,
  category: t.findings.category,
  title: t.findings.title,
  file: t.findings.file,
  startLine: t.findings.startLine,
  endLine: t.findings.endLine,
  confidence: t.findings.confidence,
  rationale: t.findings.rationale,
  dismissedAt: t.findings.dismissedAt,
};

export function emptyFindingsSummary(): FindingsSummary {
  return { counts: { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 }, items: [] };
}

function snippet(text: string): string {
  return text.length > RATIONALE_PREVIEW_MAX
    ? `${text.slice(0, RATIONALE_PREVIEW_MAX - 1).trimEnd()}…`
    : text;
}

export function summarizeFindings(rows: FindingSummaryRow[]): Map<string, FindingsSummary> {
  const out = new Map<string, FindingsSummary>();
  for (const r of rows) {
    if (r.key == null || r.dismissedAt != null) continue;
    if (!(r.severity in SEVERITY_RANK)) continue;
    const severity = r.severity as Severity;
    const summary = out.get(r.key) ?? emptyFindingsSummary();
    summary.counts[severity] += 1;
    summary.items.push({
      id: r.id,
      severity,
      category: r.category as FindingPreview['category'],
      title: r.title,
      file: r.file,
      start_line: r.startLine,
      end_line: r.endLine,
      confidence: r.confidence,
      rationale: snippet(r.rationale),
    });
    out.set(r.key, summary);
  }
  for (const summary of out.values()) {
    summary.items.sort(
      (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || b.confidence - a.confidence,
    );
  }
  return out;
}
