// scripts/check-claude-md.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isExcluded, relativeLinks, contentLines } from './claude-md-lib.mjs';
import { check } from './check-claude-md.mjs';

const MODULES = ['server', 'client', 'reviewer-core', 'e2e'];
const MODULE_MD =
  '# m\nRead [r](README.md) when starting.\n[d](docs/README.md)\n[s](specs/README.md)\n[i](INSIGHTS.md)\n';
const ROOT_LINKS = MODULES.map((m) => `[${m}](${m}/CLAUDE.md)`).join('\n') + '\n';
const ROOT_MD = ROOT_LINKS + 'Read the module guides when working in that module.\n';

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'cmd-'));
  writeFileSync(join(root, 'CLAUDE.md'), ROOT_MD);
  for (const m of MODULES) {
    mkdirSync(join(root, m, 'src', 'a'), { recursive: true });
    mkdirSync(join(root, m, 'docs'));
    mkdirSync(join(root, m, 'specs'));
    writeFileSync(join(root, m, 'README.md'), '# r\n');
    writeFileSync(join(root, m, 'docs', 'README.md'), '# d\n');
    writeFileSync(join(root, m, 'specs', 'README.md'), '# s\n');
    writeFileSync(join(root, m, 'INSIGHTS.md'), '# i\n');
    writeFileSync(join(root, m, 'CLAUDE.md'), MODULE_MD);
  }
  return root;
}

test('isExcluded skips build and dot dirs', () => {
  for (const n of ['node_modules', 'dist', '.next', 'clones', 'coverage', '.git']) {
    assert.equal(isExcluded(n), true, n);
  }
  assert.equal(isExcluded('modules'), false);
});

test('relativeLinks keeps relative targets only, strips anchors', () => {
  const md = '[a](../README.md#x) [b](https://x.io) [c](docs/) [d](mailto:a@b.c)';
  assert.deepEqual(relativeLinks(md), ['../README.md', 'docs/']);
});

test('contentLines ignores blanks', () => {
  assert.equal(contentLines('a\n\n\nb\n'), 2);
});

test('a complete fixture has no violations', () => {
  assert.deepEqual(check(fixture()), []);
});

test('reports a missing repo-root CLAUDE.md', () => {
  const root = fixture();
  writeFileSync(join(root, 'CLAUDE.md'), '');
  const v = check(root);
  assert.ok(v.some((x) => x.includes('does not link server/CLAUDE.md')), v.join('\n'));
});

test('reports a module without CLAUDE.md', () => {
  const root = fixture();
  rmSync(join(root, 'client', 'CLAUDE.md'));
  assert.ok(check(root).some((x) => x.includes('client/CLAUDE.md: missing')));
});

test('reports a broken link', () => {
  const root = fixture();
  writeFileSync(join(root, 'server', 'CLAUDE.md'), MODULE_MD + '[x](nope.md)\n');
  assert.ok(check(root).some((x) => x.includes('broken link') && x.includes('nope.md')));
});

test('reports a module root that does not link INSIGHTS.md', () => {
  const root = fixture();
  writeFileSync(join(root, 'server', 'CLAUDE.md'), '# m\n[r](README.md)\n[d](docs/README.md)\n[s](specs/README.md)\n');
  assert.ok(check(root).some((x) => x.includes('server/CLAUDE.md') && x.includes('INSIGHTS.md')));
});

test('reports a module root over the 60-line budget', () => {
  const root = fixture();
  writeFileSync(join(root, 'server', 'CLAUDE.md'), MODULE_MD + 'x\n'.repeat(60));
  assert.ok(check(root).some((x) => x.includes('server/CLAUDE.md') && x.includes('> 60')));
});

test('reports a root over the 45-line budget', () => {
  const root = fixture();
  writeFileSync(join(root, 'CLAUDE.md'), ROOT_MD + 'x\n'.repeat(45));
  assert.ok(check(root).some((x) => x.startsWith('CLAUDE.md') && x.includes('> 45')));
});

test('reports a root without a "Read ... when" pointer', () => {
  const root = fixture();
  writeFileSync(join(root, 'CLAUDE.md'), ROOT_LINKS);
  assert.ok(check(root).some((x) => x.startsWith('CLAUDE.md') && x.includes('Read')));
});

test('reports a module root without a "Read ... when" pointer', () => {
  const root = fixture();
  writeFileSync(
    join(root, 'server', 'CLAUDE.md'),
    '# m\n[r](README.md)\n[d](docs/README.md)\n[s](specs/README.md)\n[i](INSIGHTS.md)\n',
  );
  assert.ok(check(root).some((x) => x.includes('server/CLAUDE.md') && x.includes('Read')));
});

test('reports a CLAUDE.md in a subfolder', () => {
  const root = fixture();
  writeFileSync(join(root, 'server', 'src', 'a', 'CLAUDE.md'), '# stray\n');
  assert.ok(check(root).some((x) => x.includes('server/src/a/CLAUDE.md') && x.includes('stray')));
});

test('ignores CLAUDE.md inside node_modules', () => {
  const root = fixture();
  mkdirSync(join(root, 'server', 'node_modules', 'pkg'), { recursive: true });
  writeFileSync(join(root, 'server', 'node_modules', 'pkg', 'CLAUDE.md'), '# dep\n');
  assert.deepEqual(check(root), []);
});

test('reports a broken link inside a docs skeleton', () => {
  const root = fixture();
  writeFileSync(join(root, 'client', 'docs', 'README.md'), '[x](missing.md)\n');
  assert.ok(check(root).some((x) => x.includes('client/docs/README.md') && x.includes('broken link')));
});
