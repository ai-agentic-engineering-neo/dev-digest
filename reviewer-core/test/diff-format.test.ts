/**
 * numberDiffLines — the prompt-side half of citation grounding.
 *
 * These tests pin the two properties the fix depends on: the number printed on a
 * line is the line's real new-side number (so a model that copies it cites truly),
 * and the classification of added / removed / context lines matches the diff parsers
 * the grounding gate is built from. The cross-package check that the two really agree
 * on a parsed diff lives in `agent-runner/src/diff.test.ts`.
 */
import { describe, it, expect } from 'vitest';
import { numberDiffLines } from '../src/diff-format.js';
import { assemblePrompt } from '../src/prompt.js';

const SINGLE_HUNK = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -9,3 +9,4 @@
 host: 'localhost',
+apiKey: 'sk_live_abcdef123456',
 port: 3000,
`;

describe('numberDiffLines', () => {
  it('numbers added and context lines with their new-side line number', () => {
    expect(numberDiffLines(SINGLE_HUNK)).toBe(
      `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -9,3 +9,4 @@
 9  host: 'localhost',
10 +apiKey: 'sk_live_abcdef123456',
11  port: 3000,
`,
    );
  });

  it('leaves removed lines unnumbered — they have no new-side line — without shifting the count', () => {
    const out = numberDiffLines(
      `@@ -1,3 +1,3 @@
 keep
-const old = 1
+const next = 2
 tail
`,
    );
    expect(out.split('\n')).toEqual([
      '@@ -1,3 +1,3 @@',
      '1  keep',
      '  -const old = 1',
      '2 +const next = 2',
      '3  tail',
      '',
    ]);
  });

  it('restarts numbering at each hunk header and each file', () => {
    const out = numberDiffLines(
      `diff --git a/a.ts b/a.ts
@@ -1,1 +1,1 @@
+first
@@ -40,1 +41,1 @@
+later
diff --git a/b.ts b/b.ts
@@ -1,1 +7,1 @@
+other file
`,
    );
    expect(out).toContain('1 +first');
    expect(out).toContain('41 +later');
    expect(out).toContain('7 +other file');
  });

  it('pads numbers to a column so the widest line number in the hunk still aligns', () => {
    const lines = numberDiffLines(`@@ -1,12 +1,12 @@\n${'+x\n'.repeat(12)}`).split('\n');
    expect(lines[1]).toBe(' 1 +x');
    expect(lines[12]).toBe('12 +x');
  });

  it('emits headers, the file preamble and anything outside a hunk verbatim', () => {
    const preamble = `diff --git a/x.ts b/x.ts
new file mode 100644
index 0000000..1c2d3e4
--- /dev/null
+++ b/x.ts
`;
    expect(numberDiffLines(preamble)).toBe(preamble);
  });

  it('returns text with no hunk header unchanged (the slot also accepts a plain task)', () => {
    const task = 'Review the attached change and answer in one paragraph.\n';
    expect(numberDiffLines(task)).toBe(task);
  });

  it('does not count the phantom line split() produces from a trailing newline', () => {
    // Counting it would number one line past the hunk — exactly the over-extension
    // the diff parsers pop it to avoid.
    const withNewline = numberDiffLines(`@@ -1,1 +1,1 @@\n+only\n`);
    expect(withNewline).toBe(`@@ -1,1 +1,1 @@\n1 +only\n`);
    expect(numberDiffLines(`@@ -1,1 +1,1 @@\n+only`)).toBe(`@@ -1,1 +1,1 @@\n1 +only`);
  });

  it('handles a hunk header with an omitted line count (defaults to 1)', () => {
    expect(numberDiffLines(`@@ -3 +4 @@\n+one`)).toBe(`@@ -3 +4 @@\n4 +one`);
  });
});

describe('assemblePrompt — numbered diff', () => {
  const userOf = (parts: Parameters<typeof assemblePrompt>[0]) =>
    assemblePrompt(parts).messages[1]!.content;

  it('renders the diff numbered, inside the untrusted wrapper', () => {
    const user = userOf({ system: 'sys', diff: SINGLE_HUNK });
    expect(user).toContain("10 +apiKey: 'sk_live_abcdef123456',");
    expect(user).toMatch(/<untrusted source="diff">[\s\S]*10 \+apiKey/);
  });

  it('puts the "read the number, do not count" instruction outside the untrusted block', () => {
    const user = userOf({ system: 'sys', diff: SINGLE_HUNK });
    const guide = user.indexOf('never estimate it by');
    const wrapper = user.indexOf('<untrusted source="diff">');
    expect(guide).toBeGreaterThan(-1);
    expect(guide).toBeLessThan(wrapper);
  });

  it('omits the instruction when the slot carries no diff', () => {
    expect(userOf({ system: 'sys', diff: 'just a task' })).not.toContain(
      'never estimate it by',
    );
  });

  it('records the numbered diff in the trace assembly — the trace shows what the model saw', () => {
    const { assembly } = assemblePrompt({ system: 'sys', diff: SINGLE_HUNK });
    expect(assembly.user).toContain("10 +apiKey: 'sk_live_abcdef123456',");
  });
});
