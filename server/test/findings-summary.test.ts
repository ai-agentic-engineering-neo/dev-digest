/**
 * Findings rollup (`modules/reviews/findings-summary.ts`) — per-key severity
 * counts + tooltip previews for the PR list column and the timeline badges.
 * Dismissed findings are excluded; rationale is cut to a snippet.
 */
import { describe, it, expect } from 'vitest';
import {
  RATIONALE_PREVIEW_MAX,
  summarizeFindings,
  type FindingSummaryRow,
} from '../src/modules/reviews/findings-summary.js';

function row(o: Partial<FindingSummaryRow>): FindingSummaryRow {
  return {
    key: 'pr-1',
    id: 'f',
    severity: 'WARNING',
    category: 'bug',
    title: 'Title',
    file: 'src/a.ts',
    startLine: 1,
    endLine: 2,
    confidence: 0.5,
    rationale: 'why',
    dismissedAt: null,
    ...o,
  };
}

describe('summarizeFindings', () => {
  it('counts per severity per key', () => {
    const out = summarizeFindings([
      row({ id: '1', severity: 'CRITICAL' }),
      row({ id: '2', severity: 'WARNING' }),
      row({ id: '3', severity: 'WARNING' }),
      row({ id: '4', key: 'pr-2', severity: 'SUGGESTION' }),
    ]);
    expect(out.get('pr-1')!.counts).toEqual({ CRITICAL: 1, WARNING: 2, SUGGESTION: 0 });
    expect(out.get('pr-2')!.counts).toEqual({ CRITICAL: 0, WARNING: 0, SUGGESTION: 1 });
  });

  it('excludes dismissed findings, null keys and unknown severities', () => {
    const out = summarizeFindings([
      row({ id: '1', dismissedAt: new Date() }),
      row({ id: '2', key: null }),
      row({ id: '3', severity: 'INFO' }),
    ]);
    expect(out.size).toBe(0);
  });

  it('orders items by severity, then confidence desc', () => {
    const out = summarizeFindings([
      row({ id: 'sug', severity: 'SUGGESTION', confidence: 0.99 }),
      row({ id: 'warn-lo', severity: 'WARNING', confidence: 0.4 }),
      row({ id: 'crit', severity: 'CRITICAL', confidence: 0.1 }),
      row({ id: 'warn-hi', severity: 'WARNING', confidence: 0.9 }),
    ]);
    expect(out.get('pr-1')!.items.map((i) => i.id)).toEqual(['crit', 'warn-hi', 'warn-lo', 'sug']);
  });

  it('maps to the preview shape and truncates long rationale', () => {
    const out = summarizeFindings([
      row({ id: '1', startLine: 10, endLine: 12, rationale: 'x'.repeat(1000) }),
    ]);
    const item = out.get('pr-1')!.items[0]!;
    expect(item).toMatchObject({ id: '1', file: 'src/a.ts', start_line: 10, end_line: 12 });
    expect(item.rationale.length).toBe(RATIONALE_PREVIEW_MAX);
    expect(item.rationale.endsWith('…')).toBe(true);
  });
});
