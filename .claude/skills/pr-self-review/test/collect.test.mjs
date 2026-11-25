// node --test .claude/skills/pr-self-review/test
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  globToRegExp, matchSkills, checkCompleteness, loadMap, collect, addedLines, packageOf,
} from '../scripts/collect.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REAL_SKILLS_DIR = path.resolve(HERE, '..', '..');
const map = loadMap();

describe('globToRegExp', () => {
  const cases = [
    ['client/src/**/*.{ts,tsx}', 'client/src/app/page.tsx', true],
    ['client/src/**/*.{ts,tsx}', 'client/src/a.ts', true],
    ['client/src/**/*.{ts,tsx}', 'client/src/a.js', false],
    ['server/src/**/routes.ts', 'server/src/routes.ts', true],
    ['server/src/**/routes.ts', 'server/src/modules/reviews/routes.ts', true],
    ['**/pnpm-lock.yaml', 'pnpm-lock.yaml', true],
    ['**/pnpm-lock.yaml', 'client/pnpm-lock.yaml', true],
    ['client/next.config.*', 'client/next.config.mjs', true],
    ['client/*.ts', 'client/src/a.ts', false],
    ['{client,server}/**/*.ts', 'server/x/y.ts', true],
    ['a?c.md', 'abc.md', true],
    ['a.b', 'axb', false],
  ];
  for (const [glob, file, expected] of cases) {
    test(`${glob} ${expected ? 'matches' : 'does not match'} ${file}`, () => {
      assert.equal(globToRegExp(glob).test(file), expected);
    });
  }
});

describe('matchSkills with the real skill-map.json', () => {
  const names = (file, added = '') => matchSkills(file, added, map).map((m) => m.name).sort();

  test('client page → UI skills, no backend skills', () => {
    assert.deepEqual(names('client/src/app/agents/page.tsx'), [
      'frontend-ui-architecture', 'next-best-practices', 'react-best-practices', 'security', 'typescript-expert',
    ]);
  });
  test('server route → onion + fastify, no UI skills', () => {
    assert.deepEqual(names('server/src/modules/reviews/routes.ts'), [
      'fastify-best-practices', 'onion-architecture', 'security', 'typescript-expert',
    ]);
  });
  test('reviewer-core source → onion', () => {
    assert.deepEqual(names('reviewer-core/src/review/run.ts'), ['onion-architecture', 'security', 'typescript-expert']);
  });
  test('db schema → drizzle + postgres', () => {
    assert.deepEqual(names('server/src/db/schema/runs.ts'), [
      'drizzle-orm-patterns', 'onion-architecture', 'postgresql-table-design', 'security', 'typescript-expert',
    ]);
  });
  test('migration SQL → postgres only', () => {
    assert.deepEqual(names('server/src/db/migrations/0010_x.sql'), ['postgresql-table-design']);
  });
  test('client test → testing library, not architecture', () => {
    assert.deepEqual(names('client/src/app/agents/AgentList.test.tsx'), ['react-testing-library', 'typescript-expert']);
  });
  test('vendored contract → zod only', () => {
    assert.deepEqual(names('client/src/vendor/shared/contracts/findings.ts'), ['zod']);
    assert.deepEqual(names('server/src/vendor/shared/contracts/findings.ts'), ['zod']);
  });
  test('content triggers fire only on added lines in scope', () => {
    assert.ok(names('client/src/lib/foo.ts', "'use client';").includes('next-best-practices'));
    assert.ok(!names('client/src/lib/foo.ts', 'const x = 1;').includes('next-best-practices'));
    assert.ok(names('server/src/platform/jobs.ts', "import { sql } from 'drizzle-orm';").includes('drizzle-orm-patterns'));
    assert.ok(names('server/src/platform/x.ts', "import type { FastifyInstance } from 'fastify';").includes('fastify-best-practices'));
    assert.ok(names('server/src/modules/a/service.ts', "import { z } from 'zod';").includes('zod'));
    assert.ok(!names('e2e/run.ts', "import { z } from 'zod';").includes('zod'));
  });
  test('ignored and non-code files → no skills', () => {
    assert.deepEqual(names('client/pnpm-lock.yaml'), []);
    assert.deepEqual(names('docs/pr-self-review-plan.md'), []);
    assert.deepEqual(names('.github/workflows/client.yml'), []);
  });
  test('result is sorted by priority', () => {
    const order = matchSkills('server/src/modules/reviews/routes.ts', '', map).map((m) => m.priority);
    assert.deepEqual(order, [...order].sort((a, b) => a - b));
  });
});

describe('checkCompleteness', () => {
  test('the real map covers every real skill', () => {
    assert.deepEqual(checkCompleteness(map, REAL_SKILLS_DIR), []);
  });
  test('an unmapped skill and a missing skill are both reported', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prsr-skills-'));
    try {
      fs.mkdirSync(path.join(dir, 'brand-new'));
      fs.writeFileSync(path.join(dir, 'brand-new', 'SKILL.md'), '---\nname: brand-new\n---\n');
      const small = { skills: { ghost: { paths: ['x/**'] } }, excluded: {} };
      const problems = checkCompleteness(small, dir);
      assert.ok(problems.some((p) => p.includes('"brand-new" is neither')), problems.join('\n'));
      assert.ok(problems.some((p) => p.includes('"ghost"') && p.includes('does not exist')), problems.join('\n'));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
  test('a broken trigger regex is reported', () => {
    const bad = structuredClone(map);
    bad.skills.zod.triggers.patterns.push('(unclosed');
    assert.ok(checkCompleteness(bad, REAL_SKILLS_DIR).some((p) => p.includes('invalid')));
  });
});

describe('helpers', () => {
  test('addedLines keeps only + lines, without headers', () => {
    assert.equal(addedLines('--- a/x\n+++ b/x\n@@ -1 +1 @@\n-old\n+new\n context'), 'new');
  });
  test('packageOf', () => {
    assert.equal(packageOf('client/src/a.ts'), 'client');
    assert.equal(packageOf('reviewer-core/src/a.ts'), 'reviewer-core');
    assert.equal(packageOf('docs/a.md'), 'root');
  });
});

describe('collect on a fixture repository', () => {
  let repo;
  const run = (...args) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const write = (rel, content) => {
    fs.mkdirSync(path.dirname(path.join(repo, rel)), { recursive: true });
    fs.writeFileSync(path.join(repo, rel), content);
  };
  const doCollect = () => collect({ repo, base: 'main', fetch: false, map, skillsDir: REAL_SKILLS_DIR });

  before(() => {
    repo = fs.mkdtempSync(path.join(os.tmpdir(), 'prsr-repo-'));
    run('init', '--quiet', '--initial-branch=main');
    run('config', 'user.email', 'test@example.invalid');
    run('config', 'user.name', 'test');
    run('config', 'commit.gpgsign', 'false');
    write('.gitignore', '.devdigest/cache/\n');
    write('server/src/modules/reviews/service.ts', 'export const a = 1;\n');
    write('client/src/app/page.tsx', 'export default function Page() { return null; }\n');
    write('client/src/lib/old-name.ts', 'export const keep = 1;\nexport const more = 2;\nexport const evenMore = 3;\n');
    write('docs/gone.md', '# gone\n');
    run('add', '-A');
    run('commit', '--quiet', '-m', 'base');
    run('checkout', '--quiet', '-b', 'feature');
  });
  after(() => fs.rmSync(repo, { recursive: true, force: true }));

  test('clean branch → empty plan', () => {
    const plan = doCollect();
    assert.equal(plan.empty, true);
    assert.equal(plan.units.length, 0);
  });

  test('committed + staged + unstaged + untracked + deleted + renamed + binary are all collected', () => {
    // committed on the branch
    write('server/src/modules/reviews/routes.ts', "import type { FastifyInstance } from 'fastify';\nexport async function routes(app: FastifyInstance) {}\n");
    run('add', '-A');
    run('commit', '--quiet', '-m', 'route');
    // staged
    write('server/src/db/schema/runs.ts', "import { pgTable } from 'drizzle-orm/pg-core';\nexport const runs = pgTable('runs', {});\n");
    run('add', 'server/src/db/schema/runs.ts');
    // unstaged modification
    write('client/src/app/page.tsx', "'use client';\nexport default function Page() { return null; }\n");
    // deleted, renamed
    run('rm', '--quiet', 'docs/gone.md');
    run('mv', 'client/src/lib/old-name.ts', 'client/src/lib/new-name.ts');
    // untracked text + binary + ignored
    write('client/src/components/new-widget/NewWidget.tsx', 'export function NewWidget() { return null; }\n');
    fs.writeFileSync(path.join(repo, 'client/public-logo.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 1, 2, 3]));
    write('.devdigest/cache/should-not-appear.json', '{}');

    const plan = doCollect();
    const byPath = Object.fromEntries(plan.files.map((f) => [f.path, f]));

    assert.equal(plan.empty, false);
    assert.equal(byPath['server/src/modules/reviews/routes.ts'].status, 'A');
    assert.ok(byPath['server/src/modules/reviews/routes.ts'].skills.includes('fastify-best-practices'));
    assert.ok(byPath['server/src/db/schema/runs.ts'].skills.includes('postgresql-table-design'));
    assert.equal(byPath['client/src/app/page.tsx'].status, 'M');
    assert.ok(byPath['client/src/app/page.tsx'].diff.includes("+'use client';"));
    assert.equal(byPath['docs/gone.md'].status, 'D');
    assert.equal(byPath['docs/gone.md'].reviewable, false);
    assert.equal(byPath['client/src/lib/new-name.ts'].status, 'R');
    assert.equal(byPath['client/src/lib/new-name.ts'].oldPath, 'client/src/lib/old-name.ts');
    assert.equal(byPath['client/src/components/new-widget/NewWidget.tsx'].status, 'untracked');
    assert.ok(byPath['client/src/components/new-widget/NewWidget.tsx'].skills.includes('frontend-ui-architecture'));
    assert.equal(byPath['client/public-logo.png'].binary, true);
    assert.equal(byPath['client/public-logo.png'].reviewable, false);
    assert.equal(byPath['.devdigest/cache/should-not-appear.json'], undefined);

    // units: backend skills only see backend files, UI skills only UI files
    const unit = (s) => plan.units.find((u) => u.skill === s)?.files ?? [];
    assert.ok(unit('onion-architecture').every((f) => f.startsWith('server/') || f.startsWith('reviewer-core/')));
    assert.ok(unit('frontend-ui-architecture').every((f) => f.startsWith('client/')));
    assert.ok(unit('frontend-ui-architecture').length >= 2);
    assert.deepEqual(plan.packages, ['client', 'root', 'server']);
  });

  test('diff hash is stable on an unchanged diff and changes with any edit, incl. untracked', () => {
    const h1 = doCollect().diffHash;
    assert.equal(doCollect().diffHash, h1);
    write('client/src/components/new-widget/NewWidget.tsx', 'export function NewWidget() { return 1; }\n');
    const h2 = doCollect().diffHash;
    assert.notEqual(h2, h1);
    write('server/src/modules/reviews/service.ts', 'export const a = 2;\n');
    assert.notEqual(doCollect().diffHash, h2);
  });

  test('unknown base ref fails with a clear message', () => {
    assert.throws(
      () => collect({ repo, base: 'origin/nope', fetch: false, map, skillsDir: REAL_SKILLS_DIR }),
      /base ref "origin\/nope" not found/,
    );
  });
});
