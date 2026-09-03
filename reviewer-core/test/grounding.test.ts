import { describe, it, expect } from 'vitest';
import type { Finding, UnifiedDiff } from '@devdigest/shared';
import { groundFindings, groundingSummary } from '../src/index.js';

/**
 * Small two-file diff fixture, built directly as a `UnifiedDiff` literal
 * (mirrors run.test.ts's `bigDiff` helper). reviewer-core has no unified-diff
 * PARSER of its own — `parseUnifiedDiff` lives in `server/src/adapters/git/`
 * — so tests here construct the parsed shape by hand instead of reaching
 * into `server/src`.
 */
function diffFixture(): UnifiedDiff {
  return {
    raw: 'diff fixture (raw text unused by grounding)',
    files: [
      {
        path: 'src/config.ts',
        additions: 1,
        deletions: 0,
        hunks: [
          {
            file: 'src/config.ts',
            oldStart: 10,
            oldLines: 3,
            newStart: 10,
            newLines: 4,
            newLineNumbers: [11],
          },
        ],
      },
      {
        path: 'src/api/users.ts',
        additions: 4,
        deletions: 0,
        hunks: [
          {
            file: 'src/api/users.ts',
            oldStart: 44,
            oldLines: 2,
            newStart: 44,
            newLines: 6,
            newLineNumbers: [45, 46, 47, 48],
          },
        ],
      },
    ],
  };
}

function f(partial: Partial<Finding>): Finding {
  return {
    id: 'x',
    severity: 'WARNING',
    category: 'bug',
    title: 't',
    file: 'src/config.ts',
    start_line: 11,
    end_line: 11,
    rationale: 'r',
    confidence: 0.8,
    ...partial,
  };
}

describe('groundFindings — confidence floor', () => {
  const diff = diffFixture();

  it('drops a finding below CONFIDENCE_FLOOR (0.3) even with a real citation', () => {
    const res = groundFindings([f({ confidence: 0.1 })], diff);
    expect(res.kept).toHaveLength(0);
    expect(res.dropped).toHaveLength(1);
    expect(res.dropped[0]!.reason).toMatch(/confidence/i);
    expect(res.dropped[0]!.reason).toMatch(/0\.3/);
  });

  it('keeps a finding at exactly the confidence floor with a real citation', () => {
    const res = groundFindings([f({ confidence: 0.3 })], diff);
    expect(res.kept).toHaveLength(1);
    expect(res.dropped).toHaveLength(0);
  });
});

describe('groundFindings — lethal_trifecta evidence validation', () => {
  const diff = diffFixture();

  function trifectaFinding(evidence: Finding['evidence']): Finding {
    return f({
      kind: 'lethal_trifecta',
      confidence: 0.9,
      trifecta_components: ['untrusted_input', 'private_data_access', 'exfil_path'],
      evidence,
    });
  }

  it('keeps a trifecta claim when every declared component has a real file:line citation', () => {
    const finding = trifectaFinding([
      { component: 'untrusted_input', file: 'src/config.ts', line: 11 },
      { component: 'private_data_access', file: 'src/api/users.ts', line: 45 },
      { component: 'exfil_path', file: 'src/api/users.ts', line: 46 },
    ]);
    const res = groundFindings([finding], diff);
    expect(res.kept).toHaveLength(1);
    expect(res.dropped).toHaveLength(0);
  });

  it('drops a trifecta claim when one component cites a location not in the diff', () => {
    const finding = trifectaFinding([
      { component: 'untrusted_input', file: 'src/config.ts', line: 11 },
      { component: 'private_data_access', file: 'src/api/users.ts', line: 45 },
      // exfil_path points at a line no hunk covers — hallucinated citation.
      { component: 'exfil_path', file: 'src/api/users.ts', line: 999 },
    ]);
    const res = groundFindings([finding], diff);
    expect(res.kept).toHaveLength(0);
    expect(res.dropped).toHaveLength(1);
    expect(res.dropped[0]!.reason).toMatch(/lethal_trifecta/);
    expect(res.dropped[0]!.reason).toMatch(/missing|incomplete/);
  });

  it('drops a trifecta claim when a declared component has no evidence entry at all', () => {
    const finding = trifectaFinding([
      { component: 'untrusted_input', file: 'src/config.ts', line: 11 },
      { component: 'private_data_access', file: 'src/api/users.ts', line: 45 },
      // no entry at all for exfil_path
    ]);
    const res = groundFindings([finding], diff);
    expect(res.kept).toHaveLength(0);
    expect(res.dropped[0]!.reason).toMatch(/lethal_trifecta/);
  });
});

describe('hasCompleteTrifectaEvidence (via groundFindings) — component mismatch', () => {
  const diff = diffFixture();

  it('drops when evidence cites real diff locations but under the wrong/duplicate component tag', () => {
    // Every evidence entry is a REAL citation (real file:line), but they are
    // all tagged 'untrusted_input' — a model gaming "provide one entry per
    // component" by duplicating a single verified component instead of
    // actually covering private_data_access and exfil_path.
    const finding = {
      id: 'x',
      severity: 'CRITICAL',
      category: 'security',
      title: 'gamed trifecta claim',
      file: 'src/config.ts',
      start_line: 11,
      end_line: 11,
      rationale: 'r',
      confidence: 0.9,
      kind: 'lethal_trifecta',
      trifecta_components: ['untrusted_input', 'private_data_access', 'exfil_path'],
      evidence: [
        { component: 'untrusted_input', file: 'src/config.ts', line: 11 },
        { component: 'untrusted_input', file: 'src/api/users.ts', line: 45 },
        { component: 'untrusted_input', file: 'src/api/users.ts', line: 46 },
      ],
    } as Finding;

    const res = groundFindings([finding], diff);
    expect(res.kept).toHaveLength(0);
    expect(res.dropped).toHaveLength(1);
    expect(res.dropped[0]!.reason).toMatch(/lethal_trifecta/);
  });
});

describe('hasCompleteTrifectaEvidence (via groundFindings) — over-broad evidence', () => {
  const diff = diffFixture();

  it('keeps a claim that declares fewer components but has real evidence covering all of them', () => {
    // Only 2 of the 3 canonical components are DECLARED, but evidence is
    // provided for all 3 (untrusted_input, private_data_access, exfil_path).
    // hasCompleteTrifectaEvidence only requires every DECLARED component to
    // have a verified entry — it does not require evidence to be limited to
    // exactly the declared set. Extra, unused evidence entries are harmless:
    // this asserts that intentionally, so a future tightening of the check
    // (e.g. requiring evidence keys === declared components) is a deliberate
    // choice, not an accidental regression.
    const finding = f({
      kind: 'lethal_trifecta',
      confidence: 0.9,
      trifecta_components: ['untrusted_input', 'private_data_access'],
      evidence: [
        { component: 'untrusted_input', file: 'src/config.ts', line: 11 },
        { component: 'private_data_access', file: 'src/api/users.ts', line: 45 },
        { component: 'exfil_path', file: 'src/api/users.ts', line: 46 },
      ],
    });
    const res = groundFindings([finding], diff);
    expect(res.kept).toHaveLength(1);
    expect(res.dropped).toHaveLength(0);
  });
});

describe('groundingSummary', () => {
  it('reports kept/total across confidence and trifecta drops', () => {
    const diff = diffFixture();
    const res = groundFindings(
      [
        f({ confidence: 0.9 }), // kept
        f({ confidence: 0.1 }), // dropped: confidence floor
      ],
      diff,
    );
    expect(groundingSummary(res)).toBe('1/2 passed');
  });
});
