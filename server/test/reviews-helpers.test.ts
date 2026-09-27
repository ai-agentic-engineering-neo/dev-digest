import { describe, it, expect } from 'vitest';
import { taskLine, diffCountMismatches } from '../src/modules/reviews/helpers.js';
import { parseUnifiedDiff } from '../src/adapters/git/diff-parser.js';

/**
 * Unit coverage for the review task-line. The key invariant: our trusted
 * instruction always tells the model to review the whole diff and never
 * withhold a security/correctness finding — no matter what the PR text claims.
 */

describe('taskLine', () => {
  const pull = { number: 3, title: 'test: vulnerable fixture', author: 'burnjohn' } as never;

  it('names the PR being reviewed', () => {
    const line = taskLine(pull);
    expect(line).toContain('#3');
    expect(line).toContain('test: vulnerable fixture');
  });

  it('keeps the non-negotiable "never withhold security" rule', () => {
    const line = taskLine(pull);
    expect(line).toMatch(/never .*withhold .*(or downgrade )?.*security/i);
    expect(line).toMatch(/review the entire diff/i);
  });
});

/**
 * L03 — WP4.tests: `diffCountMismatches` flags a hunk whose body doesn't match
 * its `@@` header, in `{path, newStart}` form, in file order; skips a hunk
 * with no file; returns `[]` for a well-formed diff. Oracle: the plan's
 * grounding-fixture hunk-math walkthrough (spec § Contract "Server-side
 * mismatch detection"), not the parser's own output.
 */
describe('diffCountMismatches', () => {
  // Same fixture as server/test/grounding.test.ts's DIFF: "@@ -10,3 +10,4 @@"
  // declares old=3/new=4, but the body is only 2 context lines + 1 addition —
  // old reaches 1 remaining and new reaches 1 remaining, both short by one.
  const MISMATCHED_DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  stripeKey: "sk_live_xxx",
   redisUrl: x,`;

  it('flags a hunk whose body has fewer lines than its header declares', () => {
    const diff = parseUnifiedDiff(MISMATCHED_DIFF);
    expect(diffCountMismatches(diff)).toEqual([{ path: 'src/config.ts', newStart: 10 }]);
  });

  it('returns [] for a well-formed hunk whose body matches its header exactly', () => {
    const wellFormed = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,2 +10,3 @@
   port: 3000,
+  k,
   redisUrl: x,`;
    const diff = parseUnifiedDiff(wellFormed);
    expect(diffCountMismatches(diff)).toEqual([]);
  });

  it('skips a header-less short hunk that belongs to no file', () => {
    const headerless = '@@ -1,3 +1,3 @@\n a\n b';
    const diff = parseUnifiedDiff(headerless);
    expect(diffCountMismatches(diff)).toEqual([]);
  });
});
