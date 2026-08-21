import { describe, it, expect } from 'vitest';
import type { EvalCaseOutcome, EvalExpectation } from '@devdigest/shared';
import { matches, scoreCase, errorCaseOutcome, scoreRun } from './scoring.js';

const mustFind: EvalExpectation = {
  type: 'must_find',
  file: 'src/a.ts',
  start_line: 10,
  end_line: 12,
};

const mustNotFlag: EvalExpectation = {
  type: 'must_not_flag',
  file: 'src/a.ts',
  start_line: 10,
  end_line: 12,
};

function finding(overrides: Partial<{ file: string; start_line: number; end_line: number }> = {}) {
  return {
    file: 'src/a.ts',
    start_line: 10,
    end_line: 10,
    severity: 'WARNING',
    category: 'bug',
    title: 'x',
    ...overrides,
  };
}

describe('matches', () => {
  it('matches on same file and intersecting line range', () => {
    expect(matches(finding({ start_line: 11, end_line: 11 }), mustFind)).toBe(true);
  });

  it('does not match a different file', () => {
    expect(matches(finding({ file: 'src/b.ts' }), mustFind)).toBe(false);
  });

  it('does not match when ranges do not intersect', () => {
    expect(matches(finding({ start_line: 20, end_line: 21 }), mustFind)).toBe(false);
  });

  it('matches a wide finding overlapping the expectation by one line', () => {
    expect(matches(finding({ start_line: 1, end_line: 10 }), mustFind)).toBe(true);
  });
});

describe('scoreCase — AC-17', () => {
  it('must_find passes on >=1 matching finding', () => {
    const outcome = scoreCase({
      caseId: 'c1',
      name: 'case one',
      expectation: mustFind,
      findings: [finding({ start_line: 11, end_line: 11 })],
      groundingKept: 1,
      groundingTotal: 1,
      durationMs: 5,
      costUsd: 0.001,
    });
    expect(outcome.pass).toBe(true);
    expect(outcome.status).toBe('scored');
    expect(outcome.findings_matched).toBe(1);
  });

  it('must_find fails on zero matching findings', () => {
    const outcome = scoreCase({
      caseId: 'c1',
      name: 'case one',
      expectation: mustFind,
      findings: [finding({ start_line: 30, end_line: 30 })],
      groundingKept: 1,
      groundingTotal: 1,
      durationMs: 5,
      costUsd: null,
    });
    expect(outcome.pass).toBe(false);
  });

  it('must_not_flag passes on zero matching findings', () => {
    const outcome = scoreCase({
      caseId: 'c2',
      name: 'case two',
      expectation: mustNotFlag,
      findings: [],
      groundingKept: 0,
      groundingTotal: 0,
      durationMs: 1,
      costUsd: null,
    });
    expect(outcome.pass).toBe(true);
  });

  it('must_not_flag fails when a finding matches the forbidden range', () => {
    const outcome = scoreCase({
      caseId: 'c2',
      name: 'case two',
      expectation: mustNotFlag,
      findings: [finding({ start_line: 11, end_line: 11 })],
      groundingKept: 1,
      groundingTotal: 1,
      durationMs: 1,
      costUsd: null,
    });
    expect(outcome.pass).toBe(false);
  });
});

describe('errorCaseOutcome — AC-11', () => {
  it('is status errored, pass null, and contributes nothing to counts', () => {
    const outcome = errorCaseOutcome('c3', 'errored case', 'must_find', 'provider timeout', 42);
    expect(outcome.status).toBe('errored');
    expect(outcome.pass).toBeNull();
    expect(outcome.error_reason).toBe('provider timeout');
    expect(outcome.findings_total).toBe(0);
    expect(outcome.duration_ms).toBe(42);
  });
});

describe('scoreRun — AC-18 … AC-22', () => {
  it('AC-18 — recall = matched must_find / covered must_find', () => {
    const outcomes: EvalCaseOutcome[] = [
      scoreCase({
        caseId: '1',
        name: 'a',
        expectation: mustFind,
        findings: [finding({ start_line: 11, end_line: 11 })],
        groundingKept: 1,
        groundingTotal: 1,
        durationMs: 1,
        costUsd: 0,
      }),
      scoreCase({
        caseId: '2',
        name: 'b',
        expectation: mustFind,
        findings: [],
        groundingKept: 0,
        groundingTotal: 0,
        durationMs: 1,
        costUsd: 0,
      }),
    ];
    const run = scoreRun(outcomes, 100);
    expect(run.recall).toBe(0.5);
  });

  it('AC-19 — precision = 1 - FP/total over one must_not_flag case, 4 findings, 1 overlapping', () => {
    const outcome = scoreCase({
      caseId: '1',
      name: 'a',
      expectation: mustNotFlag,
      findings: [
        finding({ start_line: 11, end_line: 11 }), // overlaps — FP
        finding({ start_line: 40, end_line: 40 }),
        finding({ start_line: 41, end_line: 41 }),
        finding({ start_line: 42, end_line: 42 }),
      ],
      groundingKept: 4,
      groundingTotal: 4,
      durationMs: 1,
      costUsd: 0,
    });
    const run = scoreRun([outcome], 100);
    expect(run.precision).toBe(0.75);
  });

  it('AC-20 — recall is not applicable (null) with no must_find cases', () => {
    const outcome = scoreCase({
      caseId: '1',
      name: 'a',
      expectation: mustNotFlag,
      findings: [],
      groundingKept: 0,
      groundingTotal: 0,
      durationMs: 1,
      costUsd: 0,
    });
    const run = scoreRun([outcome], 100);
    expect(run.recall).toBeNull();
    expect(run.precision).toBeNull(); // zero findings at all
    expect(run.citation_accuracy).toBeNull(); // zero grounding denominator
  });

  it('AC-21 — citation_accuracy = kept/total from grounding numbers, not the summary string', () => {
    const outcome = scoreCase({
      caseId: '1',
      name: 'a',
      expectation: mustFind,
      findings: [finding({ start_line: 11, end_line: 11 })],
      groundingKept: 3,
      groundingTotal: 4,
      durationMs: 1,
      costUsd: 0,
    });
    const run = scoreRun([outcome], 100);
    expect(run.citation_accuracy).toBe(0.75);
  });

  it('AC-22 — a grounding-dropped finding is never counted as a false positive (it never reaches `findings`)', () => {
    // The executor only ever passes GROUNDED (kept) findings into scoreCase —
    // this test asserts the scoring layer's contract: `findings_total` here
    // is exactly the kept set's size, independent of `grounding_total`.
    const outcome = scoreCase({
      caseId: '1',
      name: 'a',
      expectation: mustNotFlag,
      findings: [finding({ start_line: 11, end_line: 11 })],
      groundingKept: 1,
      groundingTotal: 3, // 2 more findings were dropped by grounding upstream
      durationMs: 1,
      costUsd: 0,
    });
    expect(outcome.findings_total).toBe(1);
    const run = scoreRun([outcome], 100);
    expect(run.precision).toBe(0); // the one kept finding IS a false positive
  });

  it('AC-11 — an errored case is excluded from every numerator/denominator, and cases_errored is recorded', () => {
    const scored = scoreCase({
      caseId: '1',
      name: 'a',
      expectation: mustFind,
      findings: [finding({ start_line: 11, end_line: 11 })],
      groundingKept: 1,
      groundingTotal: 1,
      durationMs: 1,
      costUsd: 0,
    });
    const errored = errorCaseOutcome('2', 'b', 'must_find', 'boom', 5);
    const run = scoreRun([scored, errored], 100);
    expect(run.recall).toBe(1); // only the scored must_find case counts
    expect(run.cases_errored).toBe(1);
    expect(run.traces_total).toBe(2);
    expect(run.traces_passed).toBe(1);
  });

  it('sums cost_usd across outcomes, null-propagating (map-reduce parity)', () => {
    const a = scoreCase({
      caseId: '1',
      name: 'a',
      expectation: mustFind,
      findings: [],
      groundingKept: 0,
      groundingTotal: 0,
      durationMs: 1,
      costUsd: 0.01,
    });
    const b = scoreCase({
      caseId: '2',
      name: 'b',
      expectation: mustFind,
      findings: [],
      groundingKept: 0,
      groundingTotal: 0,
      durationMs: 1,
      costUsd: null,
    });
    expect(scoreRun([a, b], 100).cost_usd).toBeNull();
    expect(scoreRun([a], 100).cost_usd).toBeCloseTo(0.01);
  });
});
