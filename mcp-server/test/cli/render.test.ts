import { describe, expect, it } from 'vitest';
import { renderReview, type RenderFinding } from '../../src/cli/render.js';

const CRITICAL: RenderFinding = {
  severity: 'CRITICAL',
  file: 'server/src/modules/reviews/adhoc.ts',
  start_line: 88,
  end_line: 92,
  title: 'Unbounded diff read into memory',
  rationale:
    'The whole diff is buffered before the size check, so a 500 MB working tree\nallocates before it is rejected.',
  suggestion: 'check the byte length while streaming.',
};

const WARNING: RenderFinding = {
  severity: 'WARNING',
  file: 'mcp-server/src/cli/git.ts',
  start_line: 31,
  end_line: 31,
  title: "Child process inherits the caller's env",
  rationale: '...',
};

describe('renderReview', () => {
  it('renders the canned two-finding example matching the spec\'s exact output format', () => {
    const text = renderReview({
      mode: 'working',
      filesReviewed: 12,
      agentName: 'Security Reviewer',
      findings: [CRITICAL, WARNING],
      blockers: 1,
      ciFailOn: 'critical',
      grounding: '3/4 passed',
    });

    expect(text).toBe(
      [
        'devdigest review — working tree (12 file(s), agent "Security Reviewer")',
        '',
        'CRITICAL  server/src/modules/reviews/adhoc.ts:88-92  Unbounded diff read into memory',
        '  The whole diff is buffered before the size check, so a 500 MB working tree',
        '  allocates before it is rejected.',
        '  Suggestion: check the byte length while streaming.',
        '',
        'WARNING   mcp-server/src/cli/git.ts:31  Child process inherits the caller\'s env',
        '  ...',
        '',
        '2 finding(s) · 1 critical · 1 warning · 0 suggestion — 1 blocking (gate: critical)',
        'Citation grounding: 3/4 passed',
        'Note: no repo-map, caller or PR-intent context — this is the pre-push pass.',
      ].join('\n'),
    );
  });

  it('sorts CRITICAL before WARNING before SUGGESTION, regardless of input order', () => {
    const suggestion: RenderFinding = { ...WARNING, severity: 'SUGGESTION', file: 'a.ts', title: 'sug' };
    const text = renderReview({
      mode: 'working',
      filesReviewed: 1,
      agentName: 'A',
      findings: [suggestion, CRITICAL, WARNING],
      blockers: 0,
      ciFailOn: 'critical',
      grounding: '3/3 passed',
    });
    const order = [CRITICAL.title, WARNING.title, suggestion.title].filter((t) =>
      text.indexOf(t) >= 0,
    );
    const indices = order.map((t) => text.indexOf(t));
    expect(indices).toEqual([...indices].sort((a, b) => a - b));
    expect(text.indexOf(CRITICAL.title)).toBeLessThan(text.indexOf(WARNING.title));
    expect(text.indexOf(WARNING.title)).toBeLessThan(text.indexOf(suggestion.title));
  });

  it('within the same severity, sorts by file path ascending then start_line ascending', () => {
    const bLate: RenderFinding = { ...CRITICAL, file: 'b.ts', start_line: 5, end_line: 5, title: 'b-late' };
    const bEarly: RenderFinding = { ...CRITICAL, file: 'b.ts', start_line: 1, end_line: 1, title: 'b-early' };
    const aFile: RenderFinding = { ...CRITICAL, file: 'a.ts', start_line: 99, end_line: 99, title: 'a-file' };
    const text = renderReview({
      mode: 'working',
      filesReviewed: 2,
      agentName: 'A',
      findings: [bLate, aFile, bEarly],
      blockers: 3,
      ciFailOn: 'any',
      grounding: '3/3 passed',
    });
    const iA = text.indexOf('a-file');
    const iBEarly = text.indexOf('b-early');
    const iBLate = text.indexOf('b-late');
    expect(iA).toBeLessThan(iBEarly);
    expect(iBEarly).toBeLessThan(iBLate);
  });

  it('renders the zero-findings branch: "No findings. Looks good." plus the grounding + context-note lines, no counts footer', () => {
    const text = renderReview({
      mode: 'working',
      filesReviewed: 3,
      agentName: 'Security Reviewer',
      findings: [],
      blockers: 0,
      ciFailOn: 'critical',
      grounding: '0/0 passed',
    });

    expect(text).toBe(
      [
        'devdigest review — working tree (3 file(s), agent "Security Reviewer")',
        '',
        'No findings. Looks good.',
        'Citation grounding: 0/0 passed',
        'Note: no repo-map, caller or PR-intent context — this is the pre-push pass.',
      ].join('\n'),
    );
    expect(text).not.toContain('finding(s)');
  });

  it('formats a single-line finding without a dash range', () => {
    const text = renderReview({
      mode: 'working',
      filesReviewed: 1,
      agentName: 'A',
      findings: [WARNING],
      blockers: 0,
      ciFailOn: 'never',
      grounding: '1/1 passed',
    });
    expect(text).toContain('mcp-server/src/cli/git.ts:31  ');
    expect(text).not.toContain('git.ts:31-31');
  });
});
