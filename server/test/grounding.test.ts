import { describe, it, expect } from 'vitest';
import type { Finding } from '@devdigest/shared';
import { numberDiff } from '@devdigest/reviewer-core';
import { groundFindings, groundingSummary } from '../src/platform/grounding.js';
import { parseUnifiedDiff } from '../src/adapters/git/diff-parser.js';

const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  stripeKey: "sk_live_xxx",
   redisUrl: x,
diff --git a/src/api/users.ts b/src/api/users.ts
--- a/src/api/users.ts
+++ b/src/api/users.ts
@@ -44,2 +44,6 @@
   const users = await db.users.findMany();
+  for (const u of users) {
+    const posts = await db.posts.findMany({ userId: u.id });
+    result.push({ ...u, posts });
+  }`;

function f(partial: Partial<Finding>): Finding {
  return {
    id: 'x',
    severity: 'WARNING',
    category: 'bug',
    title: 't',
    file: 'src/config.ts',
    start_line: 12,
    end_line: 12,
    rationale: 'r',
    confidence: 0.8,
    ...partial,
  };
}

describe('citation grounding gate', () => {
  const diff = parseUnifiedDiff(DIFF);

  it('keeps a finding whose line intersects a real hunk', () => {
    const res = groundFindings([f({ file: 'src/config.ts', start_line: 12, end_line: 12 })], diff);
    expect(res.kept).toHaveLength(1);
    expect(res.dropped).toHaveLength(0);
  });

  it('drops a finding whose line does NOT intersect any hunk', () => {
    const res = groundFindings(
      [f({ file: 'src/config.ts', start_line: 999, end_line: 999 })],
      diff,
    );
    expect(res.kept).toHaveLength(0);
    expect(res.dropped[0]!.reason).toMatch(/do not intersect/);
  });

  it('drops a finding whose file is not in the diff', () => {
    const res = groundFindings([f({ file: 'src/not-here.ts' })], diff);
    expect(res.kept).toHaveLength(0);
    expect(res.dropped[0]!.reason).toMatch(/not present in diff/);
  });

  it('full-file kinds (secret_leak) ground against the file, not a hunk', () => {
    const res = groundFindings(
      [f({ file: 'src/config.ts', start_line: 1, end_line: 1, kind: 'secret_leak' })],
      diff,
    );
    expect(res.kept).toHaveLength(1);
  });

  it('range intersection across N+1 hunk lines', () => {
    const res = groundFindings(
      [f({ file: 'src/api/users.ts', start_line: 45, end_line: 52, category: 'perf' })],
      diff,
    );
    expect(res.kept).toHaveLength(1);
  });

  it('groundingSummary reports kept/total', () => {
    const res = groundFindings(
      [
        f({ file: 'src/config.ts', start_line: 12, end_line: 12 }),
        f({ file: 'src/config.ts', start_line: 999, end_line: 999 }),
      ],
      diff,
    );
    expect(groundingSummary(res)).toBe('1/2 passed');
  });
});

describe('unified diff parser', () => {
  it('extracts files and new-side line numbers', () => {
    const diff = parseUnifiedDiff(DIFF);
    expect(diff.files.map((f) => f.path)).toEqual(['src/config.ts', 'src/api/users.ts']);
    const config = diff.files[0]!;
    expect(config.additions).toBe(1);
    expect(config.hunks[0]!.newLineNumbers).toContain(11); // the added stripeKey line
  });

  /**
   * L03 (spec § "Server parser"): three corrections so `newLineNumbers` stays
   * exactly equal to what `numberDiff` (reviewer-core) prints — the invariant
   * grounding relies on. Oracle: spec AC-4 / AC-4b, computed by hand from the
   * fixture, never from the parser's own output.
   */
  it('AC-4: a trailing "\\n" and a "\\ No newline at end of file" marker are not counted', () => {
    const fx =
      'diff --git a/f.ts b/f.ts\n--- a/f.ts\n+++ b/f.ts\n@@ -1,2 +1,2 @@\n a\n-b\n+c\n\\ No newline at end of file\n';
    const diff = parseUnifiedDiff(fx);
    expect(diff.files).toHaveLength(1);
    const file = diff.files[0]!;
    expect(file.hunks).toHaveLength(1);
    expect(file.hunks[0]!.newLineNumbers).toEqual([1, 2]);
    expect(file.additions).toBe(1);
    expect(file.deletions).toBe(1);

    // A finding on line 3 (outside the 1-2 hunk range) must not ground.
    const res = groundFindings(
      [f({ file: 'f.ts', start_line: 3, end_line: 3 })],
      diff,
    );
    expect(res.kept).toHaveLength(0);
    expect(res.dropped[0]!.reason).toMatch(/do not intersect/);
  });

  it('AC-4: the existing users.ts fixture (with a trailing "\\n") stops at 48, no phantom 49', () => {
    const diff = parseUnifiedDiff(DIFF + '\n');
    const users = diff.files.find((file) => file.path === 'src/api/users.ts')!;
    expect(users.hunks).toHaveLength(1);
    expect(users.hunks[0]!.newLineNumbers).toEqual([44, 45, 46, 47, 48]);
    expect(users.hunks[0]!.newLineNumbers).not.toContain(49);
  });

  it('AC-4b (G1): a deleted "----" line (a removed "---" line) is a deletion, not context', () => {
    const fx = 'diff --git a/m.md b/m.md\n--- a/m.md\n+++ b/m.md\n@@ -1,3 +1,2 @@\n a\n----\n b';
    const diff = parseUnifiedDiff(fx);
    const file = diff.files[0]!;
    expect(file.hunks[0]!.newLineNumbers).toEqual([1, 2]);
    expect(file.deletions).toBe(1);
  });
});

/**
 * AC-5 — the invariant `numberDiff` (reviewer-core) and `parseUnifiedDiff`
 * (server) must never disagree on: for every hunk, the numbers `numberDiff`
 * prints equal `newLineNumbers`. Imported the same way the existing cross-package
 * caller does (`server/test/prompt-callers.test.ts:2`).
 */
describe('AC-5 — numberDiff / parseUnifiedDiff invariant', () => {
  /** Reconstruct the per-hunk number groups printed by `numberDiff`'s gutter,
   *  using only the documented gutter shape (7 cols; a "@@" line opens a new
   *  group) — never by calling the parser. */
  function groupsFromNumbered(numbered: string): number[][] {
    const groups: number[][] = [];
    let current: number[] | null = null;
    for (const line of numbered.split('\n')) {
      const gutter = line.slice(0, 7);
      const rest = line.slice(7);
      if (rest.startsWith('@@')) {
        current = [];
        groups.push(current);
        continue;
      }
      const trimmed = gutter.trim();
      if (trimmed !== '' && current) {
        current.push(Number(trimmed));
      }
    }
    return groups;
  }

  function parserGroups(fx: string): number[][] {
    return parseUnifiedDiff(fx).files.flatMap((file) => file.hunks.map((h) => h.newLineNumbers));
  }

  const AC4_NO_NEWLINE_MARKER_FIXTURE =
    'diff --git a/f.ts b/f.ts\n--- a/f.ts\n+++ b/f.ts\n@@ -1,2 +1,2 @@\n a\n-b\n+c\n\\ No newline at end of file\n';

  const MULTI_FILE_FIXTURE = [
    'diff --git a/x.ts b/x.ts',
    'index 111..222 100644',
    '--- a/x.ts',
    '+++ b/x.ts',
    '@@ -1,2 +1,2 @@',
    ' a',
    '+b',
    '@@ -10,2 +20,2 @@',
    ' c',
    '+d',
    'diff --git a/y.ts b/y.ts',
    '--- a/y.ts',
    '+++ b/y.ts',
    '@@ -5 +7 @@',
    '+e',
  ].join('\n');

  it.each([
    ['DIFF', DIFF],
    ["DIFF + '\\n'", DIFF + '\n'],
    ['AC-4 no-newline-marker fixture', AC4_NO_NEWLINE_MARKER_FIXTURE],
    ['multi-file, multi-hunk fixture', MULTI_FILE_FIXTURE],
  ])('%s: numberDiff groups equal parseUnifiedDiff newLineNumbers, per hunk', (_label, fx) => {
    expect(groupsFromNumbered(numberDiff(fx))).toEqual(parserGroups(fx));
  });
});
