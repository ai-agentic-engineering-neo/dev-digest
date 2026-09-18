import { describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import {
  groundCandidate,
  isSafeRepoPath,
  pendingDedupeKey,
  shouldInsertPending,
  snippetInRange,
} from './helpers.js';

const FILE = [
  'export function rateLimit() {',
  '  // Use p-queue, not a homemade limiter',
  '  return queue;',
  '}',
].join('\n');

const GROUNDED = {
  evidence_path: 'src/middleware/ratelimit.ts',
  evidence_start_line: 2,
  evidence_end_line: 2,
  evidence_snippet: 'Use p-queue, not a homemade limiter',
};

describe('isSafeRepoPath', () => {
  it('accepts relative clone paths and rejects traversal / absolute / empty', () => {
    expect(isSafeRepoPath('src/middleware/ratelimit.ts')).toBe(true);
    expect(isSafeRepoPath('../etc/passwd')).toBe(false);
    expect(isSafeRepoPath('src/../../etc/passwd')).toBe(false);
    expect(isSafeRepoPath('/etc/passwd')).toBe(false);
    expect(isSafeRepoPath('C:\\Windows\\system32')).toBe(false);
    expect(isSafeRepoPath('')).toBe(false);
    expect(isSafeRepoPath('   ')).toBe(false);
  });
});

describe('snippetInRange', () => {
  it('keeps an in-range snippet and drops OOB / mismatch', () => {
    expect(snippetInRange(FILE, 2, 2, '  Use p-queue, not a homemade limiter  ')).toBe(true);
    expect(snippetInRange(FILE, 2, 2, 'use p-queue, not a homemade limiter')).toBe(false);
    expect(snippetInRange(FILE, 1, 1, 'Use p-queue, not a homemade limiter')).toBe(false);
    expect(snippetInRange(FILE, 0, 1, 'export')).toBe(false);
    expect(snippetInRange(FILE, 1, 99, 'export')).toBe(false);
    expect(snippetInRange(FILE, 3, 2, 'return queue')).toBe(false);
  });
});

describe('groundCandidate', () => {
  it('keeps a fixture file + in-range snippet', () => {
    expect(groundCandidate(FILE, GROUNDED)).toBe(true);
  });

  it('drops missing, empty, OOB, snippet mismatch, and traversal paths', () => {
    expect(groundCandidate(null, GROUNDED)).toBe(false);
    expect(groundCandidate('', GROUNDED)).toBe(false);
    expect(groundCandidate('   \n', GROUNDED)).toBe(false);
    expect(groundCandidate(FILE, { ...GROUNDED, evidence_start_line: 99, evidence_end_line: 99 })).toBe(
      false,
    );
    expect(groundCandidate(FILE, { ...GROUNDED, evidence_snippet: 'homemade mutex' })).toBe(false);
    expect(groundCandidate(FILE, { ...GROUNDED, evidence_path: '../etc/passwd' })).toBe(false);
  });

  it('does not exec/spawn clone contents', () => {
    // ESM namespace exports of node:child_process are not configurable; spy the CJS module.
    const cp = createRequire(import.meta.url)('node:child_process') as typeof import('node:child_process');
    const exec = vi.spyOn(cp, 'exec');
    const execFile = vi.spyOn(cp, 'execFile');
    const spawn = vi.spyOn(cp, 'spawn');
    const fork = vi.spyOn(cp, 'fork');
    expect(groundCandidate(FILE, GROUNDED)).toBe(true);
    expect(exec).not.toHaveBeenCalled();
    expect(execFile).not.toHaveBeenCalled();
    expect(spawn).not.toHaveBeenCalled();
    expect(fork).not.toHaveBeenCalled();
    exec.mockRestore();
    execFile.mockRestore();
    spawn.mockRestore();
    fork.mockRestore();
  });
});

describe('re-scan dedupe', () => {
  it('builds a stable rule+path key', () => {
    expect(pendingDedupeKey('  Use p-queue  ', 'src/a.ts')).toBe(
      pendingDedupeKey('Use p-queue', 'src/a.ts'),
    );
  });

  it('blocks insert when any existing row shares rule+path', () => {
    const candidate = { rule: 'Use p-queue', evidence_path: 'src/a.ts' };
    expect(shouldInsertPending([], candidate)).toBe(true);
    expect(
      shouldInsertPending([{ rule: 'Use p-queue', evidencePath: 'src/a.ts' }], candidate),
    ).toBe(false);
    expect(
      shouldInsertPending([{ rule: 'Use p-queue', evidencePath: 'src/b.ts' }], candidate),
    ).toBe(true);
  });

  it('accepted and rejected keys block a new pending with the same rule+path', () => {
    const candidate = { rule: 'Use p-queue', evidence_path: 'src/a.ts' };
    expect(
      shouldInsertPending([{ rule: 'Use p-queue', evidencePath: 'src/a.ts' }], candidate),
    ).toBe(false);
  });
});
