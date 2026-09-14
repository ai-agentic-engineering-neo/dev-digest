import { describe, it, expect } from 'vitest';
import type { EvalExpectation } from '@devdigest/shared';
import { parseUnifiedDiff } from '../../adapters/git/diff-parser.js';
import { synthesizeFrozenDiff, isExpectationGrounded } from './frozen-input.js';

const PATCH = `@@ -10,3 +10,4 @@
   port: 3000,
+  stripeKey: "sk_live_xxx",
   redisUrl: x,`;

describe('synthesizeFrozenDiff — finding 8', () => {
  it('round-trips through parseUnifiedDiff to exactly one file with the expected path', () => {
    const frozen = synthesizeFrozenDiff('src/config.ts', PATCH);
    const diff = parseUnifiedDiff(frozen);
    expect(diff.files).toHaveLength(1);
    expect(diff.files[0]!.path).toBe('src/config.ts');
    expect(diff.files[0]!.hunks.length).toBeGreaterThan(0);
  });

  it('produces a self-contained diff (no external header needed)', () => {
    const frozen = synthesizeFrozenDiff('a/b.ts', '@@ -1,1 +1,1 @@\n-x\n+y');
    expect(frozen).toContain('diff --git a/a/b.ts b/a/b.ts');
    expect(frozen).toContain('--- a/a/b.ts');
    expect(frozen).toContain('+++ b/a/b.ts');
  });
});

describe('isExpectationGrounded — finding 7 / AC-6', () => {
  const path = 'src/config.ts';
  const frozen = synthesizeFrozenDiff(path, PATCH);

  it('grounds an expectation whose lines intersect a real hunk', () => {
    const expectation: EvalExpectation = {
      type: 'must_find',
      file: path,
      start_line: 12,
      end_line: 12,
    };
    expect(isExpectationGrounded(frozen, expectation)).toBe(true);
  });

  it('refuses an expectation whose lines fall outside every hunk', () => {
    const expectation: EvalExpectation = {
      type: 'must_find',
      file: path,
      start_line: 999,
      end_line: 999,
    };
    expect(isExpectationGrounded(frozen, expectation)).toBe(false);
  });

  it('refuses an expectation for a file not present in the diff', () => {
    const expectation: EvalExpectation = {
      type: 'must_find',
      file: 'src/other.ts',
      start_line: 12,
      end_line: 12,
    };
    expect(isExpectationGrounded(frozen, expectation)).toBe(false);
  });

  it('a `pr_files.patch` of null-shaped empty text yields zero hunks and is refused (Q4/PR #482 shape)', () => {
    const frozenEmpty = synthesizeFrozenDiff(path, '');
    const expectation: EvalExpectation = {
      type: 'must_find',
      file: path,
      start_line: 1,
      end_line: 1,
    };
    expect(isExpectationGrounded(frozenEmpty, expectation)).toBe(false);
  });

  it('forces the line-intersection rule even for a full-file-kind expectation (edge case)', () => {
    // A `secret_leak`-sourced expectation is exempt from line intersection at
    // REVIEW time (grounding.ts's FULL_FILE_KINDS), but the synthetic check
    // always builds `kind: 'finding'`, so out-of-hunk lines are still refused
    // here — this IS the AC-6 guard the spec describes for that edge case.
    const expectation: EvalExpectation = {
      type: 'must_find',
      file: path,
      start_line: 500,
      end_line: 500,
      title: 'secret leak (full-file kind at review time)',
    };
    expect(isExpectationGrounded(frozen, expectation)).toBe(false);
  });
});
