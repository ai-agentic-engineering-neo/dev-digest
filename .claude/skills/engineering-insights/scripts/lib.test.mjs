// Run: node --test '.claude/skills/engineering-insights/scripts/*.test.mjs'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { packageOf, parseTranscript, checkAppendOnly, checkStructure, SECTIONS } from './lib.mjs';

const ROOT = '/repo';

test('packageOf maps package files and skips everything else', () => {
  assert.equal(packageOf('server/src/app.ts', ROOT), 'server');
  assert.equal(packageOf('/repo/client/src/lib/api.ts', ROOT), 'client');
  assert.equal(packageOf('reviewer-core/src/prompt.ts', ROOT), 'reviewer-core');
  assert.equal(packageOf('e2e/specs/02-home.flow.json', ROOT), 'e2e');
  assert.equal(packageOf('server/clones/acme/src/x.ts', ROOT), null);
  assert.equal(packageOf('client/node_modules/react/index.js', ROOT), null);
  assert.equal(packageOf('server/INSIGHTS.md', ROOT), null);
  assert.equal(packageOf('scripts/dev.sh', ROOT), null);
  assert.equal(packageOf('/elsewhere/server/a.ts', ROOT), null);
});

test('parseTranscript collects edits and the last skill run', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ei-'));
  const file = join(dir, 's.jsonl');
  const tool = (name, input, at) =>
    JSON.stringify({ type: 'assistant', timestamp: at, message: { content: [{ type: 'tool_use', name, input }] } });
  writeFileSync(file, [
    tool('Edit', { file_path: '/repo/server/src/a.ts' }, '2026-10-08T10:00:00.000Z'),
    tool('Read', { file_path: '/repo/client/src/b.ts' }, '2026-10-08T10:01:00.000Z'),
    tool('Skill', { skill: 'engineering-insights' }, '2026-10-08T10:02:00.000Z'),
    'not json',
    JSON.stringify({ type: 'user', timestamp: '2026-10-08T10:03:00.000Z', message: { content: '<command-name>/engineering-insights</command-name>' } }),
    tool('Write', { file_path: '/repo/e2e/specs/x.flow.json' }, '2026-10-08T10:04:00.000Z'),
  ].join('\n'));
  const { edits, lastRun } = parseTranscript(file);
  assert.deepEqual(edits.map((e) => e.path), ['/repo/server/src/a.ts', '/repo/e2e/specs/x.flow.json']);
  assert.equal(lastRun, '2026-10-08T10:03:00.000Z');
});

test('checkAppendOnly allows insertions, rejects edits and deletions', () => {
  const base = 'a\nb\nc';
  assert.ok(checkAppendOnly(base, 'a\nnew\nb\nc\nmore').ok);
  assert.deepEqual(checkAppendOnly(base, 'a\nc'), { ok: false, missing: 'b', line: 2 });
  assert.equal(checkAppendOnly(base, 'a\nB\nc').ok, false);
  assert.equal(checkAppendOnly(base, 'b\na\nc').ok, false);
});

const doc = (body) => SECTIONS.map((s) => `## ${s}\n${body[s] ?? ''}`).join('\n');

test('checkStructure accepts a well-formed file', () => {
  const r = checkStructure(doc({ 'What Works': '### 2026-10-08 — batch inserts\ntext' }));
  assert.deepEqual(r.problems, []);
  assert.equal(r.entries, 1);
});

test('checkStructure flags duplicate titles, even across dates and sections', () => {
  const r = checkStructure(doc({
    'What Works': '### 2026-10-01 — Batch inserts',
    'Codebase Patterns': '### 2026-10-08 — batch inserts',
  }));
  assert.equal(r.problems.length, 1);
  assert.match(r.problems[0], /duplicate entry title/);
});

test('checkStructure flags missing and misordered sections, ignores fenced examples', () => {
  const missing = checkStructure('## What Works\n```md\n### YYYY-MM-DD — t\n### YYYY-MM-DD — t\n```');
  assert.ok(missing.problems.some((p) => p.includes('missing section "## Open Questions"')));
  assert.ok(!missing.problems.some((p) => p.includes('duplicate')));
  const swapped = checkStructure(doc({}).replace('## What Works', '## TMP').replace("## What Doesn't Work", '## What Works').replace('## TMP', "## What Doesn't Work"));
  assert.ok(swapped.problems.includes('sections are out of order'));
});
