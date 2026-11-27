// node --test .claude/skills/pr-self-review/scripts/
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { globToRegExp, routeFiles, splitBucket } from './lib/routing.mjs';
import { SKILL_DIR } from './lib/util.mjs';

const map = JSON.parse(fs.readFileSync(path.join(SKILL_DIR, 'skill-map.json'), 'utf8'));
const file = (p, extra = {}) => ({ path: p, deleted: false, binary: false, changed_lines: 10, ...extra });
const skillsFor = (p, content = '') => {
  const { buckets } = routeFiles([file(p)], map, () => content);
  return buckets.map((b) => b.skill).sort();
};

test('glob: ** spans directories, * stays in one, {a,b} alternates', () => {
  assert.ok(globToRegExp('client/src/**/*.{ts,tsx}').test('client/src/a.tsx'));
  assert.ok(globToRegExp('client/src/**/*.{ts,tsx}').test('client/src/x/y/z.ts'));
  assert.ok(!globToRegExp('client/src/**/*.{ts,tsx}').test('client/src/x/y/z.css'));
  assert.ok(globToRegExp('**/*.md').test('README.md'));
  assert.ok(globToRegExp('**/*.md').test('a/b/README.md'));
  assert.ok(!globToRegExp('server/*.ts').test('server/src/app.ts'));
  assert.ok(globToRegExp('server/clones/**').test('server/clones/x/y.ts'));
});

test('UI component → frontend skills, not backend ones', () => {
  assert.deepEqual(skillsFor('client/src/app/repos/page.tsx'), [
    'frontend-ui-architecture',
    'next-best-practices',
    'react-best-practices',
    'security',
    'typescript-expert',
  ]);
});

test('client hook → react + frontend architecture, no next', () => {
  assert.deepEqual(skillsFor('client/src/lib/hooks/reviews.ts'), [
    'frontend-ui-architecture',
    'react-best-practices',
    'security',
    'typescript-expert',
  ]);
});

test('client test → react-testing-library only (+ typescript)', () => {
  assert.deepEqual(skillsFor('client/src/components/x.test.tsx'), ['react-testing-library', 'typescript-expert']);
});

test('db schema → drizzle + postgres + onion, no frontend', () => {
  assert.deepEqual(skillsFor('server/src/db/schema/pulls.ts'), [
    'drizzle-orm-patterns',
    'onion-architecture',
    'postgresql-table-design',
    'security',
    'typescript-expert',
  ]);
});

test('route file → fastify + onion; zod only when the file imports zod', () => {
  const base = ['fastify-best-practices', 'onion-architecture', 'security', 'typescript-expert'];
  assert.deepEqual(skillsFor('server/src/modules/pulls/routes.ts'), base);
  assert.deepEqual(skillsFor('server/src/modules/pulls/routes.ts', "import { z } from 'zod';"), [...base, 'zod'].sort());
});

test('client vendor copy of shared is not reviewed twice (drift check covers it)', () => {
  assert.deepEqual(skillsFor('client/src/vendor/shared/contracts/trace.ts', "import { z } from 'zod';"), []);
});

test('docs, lockfiles, migrations and vendored skills are excluded; deleted files skipped', () => {
  const r = routeFiles(
    [
      file('README.md'),
      file('server/pnpm-lock.yaml'),
      file('server/src/db/migrations/0011_x.sql'),
      file('.claude/skills/zod/SKILL.md'),
      file('server/src/old.ts', { deleted: true }),
    ],
    map,
  );
  assert.equal(r.buckets.length, 0);
  assert.equal(r.excluded.length, 4);
  assert.deepEqual(r.skipped, ['server/src/old.ts']);
});

test('unmapped files are reported', () => {
  const r = routeFiles([file('docker-compose.override.yml')], map);
  assert.deepEqual(r.unmapped, ['docker-compose.override.yml']);
});

test('every skill in the map exists on disk', () => {
  for (const s of Object.keys(map.skills)) {
    assert.ok(fs.existsSync(path.join(SKILL_DIR, '..', s, 'SKILL.md')), `missing skill ${s}`);
  }
});

test('large buckets split by directory under the line budget', () => {
  const files = [
    file('a/1.ts', { changed_lines: 900 }),
    file('a/2.ts', { changed_lines: 500 }),
    file('b/1.ts', { changed_lines: 800 }),
    file('c/1.ts', { changed_lines: 3000 }),
  ];
  const chunks = splitBucket(files, 1500);
  assert.deepEqual(
    chunks.map((c) => c.map((f) => f.path)),
    [['a/1.ts', 'a/2.ts'], ['b/1.ts'], ['c/1.ts']],
  );
  assert.equal(splitBucket(files.slice(0, 2), 1500).length, 1);
});
