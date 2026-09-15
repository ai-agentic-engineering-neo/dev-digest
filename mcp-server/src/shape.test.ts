import { describe, expect, it } from 'vitest';
import { MAX_FINDINGS, shapeReviewRecord, shapeRunStatus } from './shape.js';
import type { Finding, ReviewRecord, RunSummary, Severity } from './types.js';

function finding(id: string, severity: Severity): Finding & { review_id: string } {
  return {
    id,
    review_id: 'rv1',
    severity,
    category: 'bug',
    title: id,
    file: 'a.ts',
    start_line: 1,
    end_line: 2,
    rationale: 'because',
  };
}

function review(findings: ReturnType<typeof finding>[]): ReviewRecord {
  return { id: 'rv1', pr_id: 'pr1', run_id: 'run1', verdict: 'comment', findings };
}

describe('shapeReviewRecord', () => {
  it('sorts CRITICAL before WARNING before SUGGESTION', () => {
    const shaped = shapeReviewRecord(
      review([finding('s', 'SUGGESTION'), finding('c', 'CRITICAL'), finding('w', 'WARNING')]),
    );
    expect(shaped.findings.map((f) => f.id)).toEqual(['c', 'w', 's']);
  });

  it('caps at MAX_FINDINGS and reports the omitted count', () => {
    const many = Array.from({ length: MAX_FINDINGS + 7 }, (_, i) => finding(`f${i}`, 'SUGGESTION'));
    const shaped = shapeReviewRecord(review(many));
    expect(shaped.findings).toHaveLength(MAX_FINDINGS);
    expect(shaped.truncated).toBe(true);
    expect(shaped.omitted_count).toBe(7);
  });

  it('does not truncate at or under the cap', () => {
    const exact = Array.from({ length: MAX_FINDINGS }, (_, i) => finding(`f${i}`, 'WARNING'));
    const shaped = shapeReviewRecord(review(exact));
    expect(shaped.truncated).toBe(false);
    expect(shaped.omitted_count).toBe(0);
  });
});

describe('shapeRunStatus', () => {
  const base: RunSummary = {
    run_id: 'run1',
    agent_id: 'a1',
    agent_name: 'Agent',
    status: null,
    error: null,
    findings_count: null,
    ran_at: null,
  };

  it.each([
    ['running', 'still running'],
    ['done', 'is done'],
  ] as const)('covers status=%s', (status, expected) => {
    expect(shapeRunStatus({ ...base, status })).toContain(expected);
  });

  it('includes the error text for a failed run', () => {
    expect(shapeRunStatus({ ...base, status: 'failed', error: 'boom' })).toContain('boom');
  });

  it('covers a cancelled run', () => {
    expect(shapeRunStatus({ ...base, status: 'cancelled' })).toContain('cancelled');
  });

  it('falls back gracefully for an unknown/null status', () => {
    expect(shapeRunStatus({ ...base, status: null })).toContain('unknown');
  });
});
