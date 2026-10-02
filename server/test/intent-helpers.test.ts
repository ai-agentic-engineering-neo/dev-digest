import { describe, it, expect } from 'vitest';
import { detectContextGaps, renderIntentText, INDIRECT_BODY_THRESHOLD } from '../src/modules/intent/helpers.js';

/**
 * Unit coverage for the intent module's pure helpers (specs/05-intent-layer.md
 * revision 2). `detectContextGaps` replaces v1's `applyConfidenceCeiling` —
 * gaps are named deterministically from the same signals `service.ts` already
 * gathers, never left to the model to self-assess.
 */
describe('detectContextGaps', () => {
  it('flags all three gap types for an empty-body PR with an unresolved issue and spec', () => {
    const gaps = detectContextGaps({
      body: '',
      issueNumberParsed: 471,
      hasResolvedIssue: false,
      specPathParsed: 'specs/09-x.md',
      hasResolvedSpec: false,
    });
    expect(gaps).toEqual([
      'PR description is empty or near-empty',
      'referenced issue #471 could not be resolved',
      'referenced spec specs/09-x.md could not be read',
    ]);
  });

  it('reports no gaps for a full-signal PR (real body, resolved issue, resolved spec)', () => {
    const gaps = detectContextGaps({
      body: 'Adds rate limiting to the public /api endpoints, per the linked issue.',
      issueNumberParsed: 471,
      hasResolvedIssue: true,
      specPathParsed: 'specs/09-x.md',
      hasResolvedSpec: true,
    });
    expect(gaps).toEqual([]);
  });

  it('flags only the body gap when no issue/spec was referenced at all', () => {
    const gaps = detectContextGaps({
      body: null,
      issueNumberParsed: null,
      hasResolvedIssue: false,
      specPathParsed: null,
      hasResolvedSpec: false,
    });
    expect(gaps).toEqual(['PR description is empty or near-empty']);
  });

  it('never flags an issue/spec gap when none was referenced (resolved=false is not itself a gap)', () => {
    const gaps = detectContextGaps({
      body: 'x'.repeat(INDIRECT_BODY_THRESHOLD),
      issueNumberParsed: null,
      hasResolvedIssue: false,
      specPathParsed: null,
      hasResolvedSpec: false,
    });
    expect(gaps).toEqual([]);
  });

  it('a body right at the threshold is not a gap; one under it is', () => {
    const atThreshold = detectContextGaps({
      body: 'x'.repeat(INDIRECT_BODY_THRESHOLD),
      issueNumberParsed: null,
      hasResolvedIssue: false,
      specPathParsed: null,
      hasResolvedSpec: false,
    });
    expect(atThreshold).toEqual([]);

    const underThreshold = detectContextGaps({
      body: 'x'.repeat(INDIRECT_BODY_THRESHOLD - 1),
      issueNumberParsed: null,
      hasResolvedIssue: false,
      specPathParsed: null,
      hasResolvedSpec: false,
    });
    expect(underThreshold).toEqual(['PR description is empty or near-empty']);
  });
});

describe('renderIntentText', () => {
  it('renders summary + derived-from signals, with no confidence field', () => {
    const text = renderIntentText('Adds rate limiting.', ['PR description', 'linked issue #471']);
    expect(text).toBe('Summary: Adds rate limiting.\nDerived from: PR description, linked issue #471');
    expect(text).not.toContain('Confidence');
  });

  it('falls back to "PR title only" when no signals were gathered', () => {
    const text = renderIntentText('Adds rate limiting.', []);
    expect(text).toContain('Derived from: PR title only');
  });
});
