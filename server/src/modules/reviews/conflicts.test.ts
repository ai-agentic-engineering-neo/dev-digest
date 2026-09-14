import { describe, expect, it } from 'vitest';
import { computeConflicts, type ConflictColumn, type ConflictFinding } from './conflicts.js';
import { CONFLICT_MAX_RANGE_LINES, FULL_FILE_KINDS } from './constants.js';

function finding(overrides: Partial<ConflictFinding> & { id: string }): ConflictFinding {
  return {
    severity: 'WARNING',
    title: 'A finding',
    file: 'src/foo.ts',
    start_line: 10,
    end_line: 10,
    kind: null,
    rationale: 'Because reasons.',
    ...overrides,
  };
}

function column(overrides: Partial<ConflictColumn> & { agent_id: string }): ConflictColumn {
  return {
    agent_name: overrides.agent_id,
    status: 'done',
    findings: [],
    ...overrides,
  };
}

describe('computeConflicts — participants gating (D8, AC-38, AC-42)', () => {
  it('returns [] when fewer than two agents participated (status done)', () => {
    const a = column({ agent_id: 'a', status: 'done', findings: [finding({ id: 'f1', severity: 'CRITICAL' })] });
    expect(computeConflicts([a])).toEqual([]);
  });

  it('a failed/cancelled/running agent never counts as "did not flag" — no conflict is manufactured', () => {
    const a = column({ agent_id: 'a', status: 'done', findings: [finding({ id: 'f1', severity: 'CRITICAL' })] });
    const b = column({ agent_id: 'b', status: 'failed', findings: [] });
    // Only one DONE participant -> below the two-participant threshold.
    expect(computeConflicts([a, b])).toEqual([]);
  });
});

describe('computeConflicts — contention rules (AC-37)', () => {
  it('one agent flags, another (participating) ignores -> a conflict', () => {
    const a = column({ agent_id: 'a', findings: [finding({ id: 'f1', severity: 'CRITICAL', start_line: 5, end_line: 5 })] });
    const b = column({ agent_id: 'b', findings: [] });
    const conflicts = computeConflicts([a, b]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]!.takes).toHaveLength(2);
    const bTake = conflicts[0]!.takes.find((t) => t.agent_id === 'b')!;
    expect(bTake.verdict).toBe('ignored');
    expect(bTake.note).toBe('');
  });

  it('two agents flag the same location at the SAME severity -> agreement, no conflict', () => {
    const a = column({ agent_id: 'a', findings: [finding({ id: 'f1', severity: 'WARNING', start_line: 5, end_line: 5 })] });
    const b = column({ agent_id: 'b', findings: [finding({ id: 'f2', severity: 'WARNING', start_line: 5, end_line: 5 })] });
    expect(computeConflicts([a, b])).toEqual([]);
  });

  it('two agents flag the same location at DIFFERENT severities -> a conflict', () => {
    const a = column({ agent_id: 'a', findings: [finding({ id: 'f1', severity: 'CRITICAL', start_line: 5, end_line: 5 })] });
    const b = column({ agent_id: 'b', findings: [finding({ id: 'f2', severity: 'WARNING', start_line: 5, end_line: 5 })] });
    const conflicts = computeConflicts([a, b]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]!.takes.map((t) => t.verdict).sort()).toEqual(['CRITICAL', 'WARNING']);
  });

  it('zero conflicts is a valid, correct result when >=2 agents agree on everything (AC-40, distinct from AC-42)', () => {
    const a = column({ agent_id: 'a', findings: [] });
    const b = column({ agent_id: 'b', findings: [] });
    expect(computeConflicts([a, b])).toEqual([]);
  });
});

describe('computeConflicts — D-P1: file-scoped vs line-scoped, never cross-matched', () => {
  it('two line-scoped findings on the SAME file with intersecting ranges match (AC-36)', () => {
    const a = column({ agent_id: 'a', findings: [finding({ id: 'f1', severity: 'CRITICAL', start_line: 10, end_line: 20 })] });
    const b = column({ agent_id: 'b', findings: [] });
    const conflicts = computeConflicts([a, b]);
    expect(conflicts).toHaveLength(1);
  });

  it('the same two ranges on DIFFERENT files never match', () => {
    const a = column({
      agent_id: 'a',
      findings: [finding({ id: 'f1', severity: 'CRITICAL', file: 'src/a.ts', start_line: 10, end_line: 20 })],
    });
    const b = column({
      agent_id: 'b',
      findings: [finding({ id: 'f2', severity: 'WARNING', file: 'src/b.ts', start_line: 10, end_line: 20 })],
    });
    // Each location has only ONE flagging agent + one ignoring agent -> two
    // separate one-vs-ignored conflicts, not a single merged one.
    const conflicts = computeConflicts([a, b]);
    expect(conflicts).toHaveLength(2);
    expect(conflicts.map((c) => c.file).sort()).toEqual(['src/a.ts', 'src/b.ts']);
  });

  it('a full-file kind never matches a line-ranged finding on the same file, even at the same line', () => {
    expect(FULL_FILE_KINDS.has('secret_leak')).toBe(true);
    const a = column({
      agent_id: 'a',
      findings: [finding({ id: 'f1', severity: 'CRITICAL', kind: 'secret_leak', start_line: 1, end_line: 1 })],
    });
    const b = column({
      agent_id: 'b',
      findings: [finding({ id: 'f2', severity: 'CRITICAL', kind: 'finding', start_line: 1, end_line: 1 })],
    });
    // Neither finding's location matches the other's, so each agent "ignores"
    // the other's location -> two separate conflicts, not one merged one.
    const conflicts = computeConflicts([a, b]);
    expect(conflicts).toHaveLength(2);
  });

  it('a range wider than CONFLICT_MAX_RANGE_LINES is treated as file-scoped: matches another oversized finding on the same file regardless of exact lines', () => {
    const wide = CONFLICT_MAX_RANGE_LINES + 20;
    const a = column({
      agent_id: 'a',
      findings: [finding({ id: 'f1', severity: 'CRITICAL', start_line: 1, end_line: wide })],
    });
    const b = column({
      agent_id: 'b',
      findings: [finding({ id: 'f2', severity: 'WARNING', start_line: 500, end_line: 500 + wide })],
    });
    const conflicts = computeConflicts([a, b]);
    // Same file, both oversized (kind class 'finding') -> ONE merged location,
    // one conflict with divergent severities.
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]!.takes.map((t) => t.verdict).sort()).toEqual(['CRITICAL', 'WARNING']);
  });

  it('a range exactly at the cap is line-scoped (not file-scoped) — only spans wider than the cap flip', () => {
    const exact = CONFLICT_MAX_RANGE_LINES; // inclusive line count == cap, not > cap
    const a = column({
      agent_id: 'a',
      findings: [finding({ id: 'f1', severity: 'CRITICAL', start_line: 1, end_line: exact })],
    });
    const b = column({
      agent_id: 'b',
      // does not intersect [1, exact] and is not oversized -> a distinct location
      findings: [finding({ id: 'f2', severity: 'WARNING', start_line: exact + 5, end_line: exact + 5 })],
    });
    const conflicts = computeConflicts([a, b]);
    expect(conflicts).toHaveLength(2); // two independent one-vs-ignored locations
  });
});

describe('computeConflicts — D-P3: interval-merge transitive closure', () => {
  it('a chain of overlapping ranges 10-20 / 18-25 / 24-30 merges into ONE location, deterministically regardless of row order', () => {
    const a = column({ agent_id: 'a', findings: [finding({ id: 'f1', severity: 'CRITICAL', start_line: 10, end_line: 20 })] });
    const b = column({ agent_id: 'b', findings: [finding({ id: 'f2', severity: 'CRITICAL', start_line: 18, end_line: 25 })] });
    const c = column({ agent_id: 'c', findings: [finding({ id: 'f3', severity: 'WARNING', start_line: 24, end_line: 30 })] });

    const inOrder = computeConflicts([a, b, c]);
    const shuffled = computeConflicts([c, a, b]);

    expect(inOrder).toHaveLength(1);
    expect(inOrder).toEqual(shuffled);
    expect(inOrder[0]!.takes).toHaveLength(3);
  });
});

describe('computeConflicts — D-P2: anchor line and determinism', () => {
  it('line is the MINIMUM start_line among the flagging findings, tie-broken by the lexicographically smallest id', () => {
    const a = column({
      agent_id: 'a',
      findings: [finding({ id: 'f-b', severity: 'CRITICAL', title: 'From B', start_line: 12, end_line: 20 })],
    });
    const b = column({
      agent_id: 'b',
      findings: [finding({ id: 'f-a', severity: 'WARNING', title: 'From A', start_line: 12, end_line: 15 })],
    });
    const conflicts = computeConflicts([a, b]);
    expect(conflicts).toHaveLength(1);
    // Both findings start at line 12; tie-break picks the smaller id ('f-a').
    expect(conflicts[0]!.line).toBe(12);
    expect(conflicts[0]!.title).toBe('From A');
  });

  it('the same input produces byte-identical (deep-equal) conflicts on repeated calls', () => {
    const a = column({ agent_id: 'a', findings: [finding({ id: 'f1', severity: 'CRITICAL', start_line: 5, end_line: 5 })] });
    const b = column({ agent_id: 'b', findings: [] });
    const first = computeConflicts([a, b]);
    const second = computeConflicts([a, b]);
    expect(first).toEqual(second);
  });

  it('sorts the output by (file, line, title)', () => {
    const a = column({
      agent_id: 'a',
      findings: [
        finding({ id: 'f1', severity: 'CRITICAL', file: 'src/z.ts', start_line: 1, end_line: 1, title: 'Z issue' }),
        finding({ id: 'f2', severity: 'CRITICAL', file: 'src/a.ts', start_line: 20, end_line: 20, title: 'A issue late' }),
        finding({ id: 'f3', severity: 'CRITICAL', file: 'src/a.ts', start_line: 5, end_line: 5, title: 'A issue early' }),
      ],
    });
    const b = column({ agent_id: 'b', findings: [] });
    const conflicts = computeConflicts([a, b]);
    expect(conflicts.map((c) => [c.file, c.line])).toEqual([
      ['src/a.ts', 5],
      ['src/a.ts', 20],
      ['src/z.ts', 1],
    ]);
  });
});

describe('computeConflicts — take shape (AC-39)', () => {
  it('a flagging take carries severity and a one-line note from the rationale; an ignoring take carries an empty note', () => {
    const a = column({
      agent_id: 'a',
      agent_name: 'Security Reviewer',
      findings: [
        finding({
          id: 'f1',
          severity: 'CRITICAL',
          start_line: 5,
          end_line: 5,
          rationale: 'A live Stripe key is committed.\nMore detail on a second line.',
        }),
      ],
    });
    const b = column({ agent_id: 'b', agent_name: 'Performance Reviewer', findings: [] });
    const conflicts = computeConflicts([a, b]);
    const aTake = conflicts[0]!.takes.find((t) => t.agent_id === 'a')!;
    expect(aTake.persona).toBe('Security Reviewer');
    expect(aTake.verdict).toBe('CRITICAL');
    expect(aTake.note).toBe('A live Stripe key is committed.');
    const bTake = conflicts[0]!.takes.find((t) => t.agent_id === 'b')!;
    expect(bTake.persona).toBe('Performance Reviewer');
    expect(bTake.verdict).toBe('ignored');
    expect(bTake.note).toBe('');
  });

  it('truncates a long rationale first line to the constant', () => {
    const long = 'x'.repeat(500);
    const a = column({ agent_id: 'a', findings: [finding({ id: 'f1', severity: 'CRITICAL', start_line: 5, end_line: 5, rationale: long })] });
    const b = column({ agent_id: 'b', findings: [] });
    const conflicts = computeConflicts([a, b]);
    const aTake = conflicts[0]!.takes.find((t) => t.agent_id === 'a')!;
    expect(aTake.note.length).toBeLessThan(long.length);
    expect(aTake.note.endsWith('…')).toBe(true);
  });
});
