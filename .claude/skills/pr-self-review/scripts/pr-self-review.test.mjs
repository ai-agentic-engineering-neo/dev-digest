// Run from the repo root: node --test ".claude/skills/pr-self-review/scripts/*.test.mjs"
// Each test builds a throwaway git repo shaped like this one and drives the
// scripts through their exported functions, against the real routing.json and
// criticals.md.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { collect } from './collect.mjs';
import { decide, isGated } from './gate.mjs';
import { globToRegExp, loadCriticalIds, loadRouting, snapshot } from './lib.mjs';
import { finalize, record, report } from './verdict.mjs';

const routing = loadRouting();
const ROUTED_SKILLS = routing.groups.flatMap((group) => group.lenses.map((lens) => lens.skill).filter(Boolean));
const SERVICE = 'server/src/modules/widgets/service.ts';
const CRITICAL_RULE = 'onion/query-in-route';

function makeRepo(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pr-self-review-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const run = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const write = (file, content) => {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), content);
  };
  const commit = (message) => {
    run('add', '-A');
    run('commit', '-q', '-m', message);
  };
  run('init', '-q', '-b', 'main');
  run('config', 'user.email', 'test@example.com');
  run('config', 'user.name', 'Test');
  run('config', 'commit.gpgsign', 'false');
  for (const skill of ROUTED_SKILLS) write(`.claude/skills/${skill}/SKILL.md`, `# ${skill}\n`);
  for (const pkg of ['', 'server/', 'client/', 'reviewer-core/', 'e2e/']) write(`${pkg}AGENTS.md`, '# rules\n');
  fs.symlinkSync('AGENTS.md', path.join(root, 'CLAUDE.md'));
  write('server/src/db/migrations/0000_init.sql', 'create table a (id int);\n');
  write('server/src/vendor/shared/contracts/a.ts', 'export const A = 1;\n');
  write('client/src/vendor/shared/contracts/a.ts', 'export const A = 1;\n');
  write(SERVICE, 'export const one = 1;\nexport const two = 2;\nexport const three = 3;\n');
  write('client/src/app/page.tsx', 'export default function Page() {\n  return null;\n}\n');
  commit('base');
  run('checkout', '-q', '-b', 'feature');
  // deps:validate is stubbed: these repos have no server package to run it in.
  const options = { cwd: root, base: 'main', depsRunner: () => ({ ok: true, output: '' }) };
  return { root, run, write, commit, options, at: { cwd: root } };
}

const groupIds = (manifest) => manifest.groups.map((group) => group.id);
const rules = (manifest) => manifest.mechanical.map((finding) => finding.rule);
const lensFiles = (manifest, lens) =>
  manifest.groups.flatMap((group) => group.lenses).find((candidate) => candidate.name === lens)?.files ?? [];

function critical(overrides = {}) {
  return {
    severity: 'CRITICAL',
    rule: CRITICAL_RULE,
    file: SERVICE,
    line: 2,
    title: 'Query in a route',
    why: 'because',
    verified: true,
    evidence: 'export const two = 22;',
    ...overrides,
  };
}

/** Records an empty review for every group except `only`, which gets `findings`. */
function reviewAll(repo, manifest, only, findings) {
  for (const group of manifest.groups) {
    record({ ...repo.at, groupId: group.id, input: { findings: group.id === only ? findings : [] } });
  }
  return finalize(repo.at);
}

test('globs match whole repo-relative paths', () => {
  assert.ok(globToRegExp('client/src/**/*.{ts,tsx}').test('client/src/app/page.tsx'));
  assert.ok(globToRegExp('client/src/**/*.{ts,tsx}').test('client/src/a.ts'));
  assert.ok(!globToRegExp('client/src/**/*.tsx').test('server/client/src/a.tsx'));
  assert.ok(globToRegExp('client/src/**/use[A-Z]*.ts').test('client/src/app/useThing.ts'));
  assert.ok(!globToRegExp('client/src/**/use[A-Z]*.ts').test('client/src/app/user.ts'));
  assert.ok(!globToRegExp('server/src/db/migrations/*.sql').test('server/src/db/migrations/meta/x.sql'));
});

test('criticals.md registers the rule ids a reviewer may rate CRITICAL', () => {
  const ids = loadCriticalIds();
  assert.ok(ids.has(CRITICAL_RULE));
  assert.ok(ids.size >= 20);
});

test('a mixed diff sends backend files to backend lenses and UI files to UI lenses', (t) => {
  const repo = makeRepo(t);
  repo.write('server/src/modules/widgets/routes.ts', "import type { FastifyInstance } from 'fastify';\nimport { z } from 'zod';\n");
  repo.write('server/src/modules/widgets/repository.ts', "import { eq } from 'drizzle-orm';\n");
  repo.write('client/src/app/_components/Card/Card.tsx', 'export function Card() {\n  return null;\n}\n');
  repo.write('client/src/app/_components/Card/Card.test.tsx', 'export {};\n');
  repo.write('docs/notes.md', '# notes\n');
  repo.write('server/clones/acme/index.ts', 'export {};\n');
  const manifest = collect(repo.options);

  assert.deepEqual(groupIds(manifest), [
    'backend-architecture',
    'backend-data',
    'frontend-architecture',
    'react',
    'cross-cutting',
    'security',
    'repo-rules',
  ]);
  assert.deepEqual(lensFiles(manifest, 'onion-architecture'), [
    'server/src/modules/widgets/repository.ts',
    'server/src/modules/widgets/routes.ts',
  ]);
  assert.deepEqual(lensFiles(manifest, 'fastify-best-practices'), ['server/src/modules/widgets/routes.ts']);
  assert.deepEqual(lensFiles(manifest, 'drizzle-orm-patterns'), ['server/src/modules/widgets/repository.ts']);
  assert.deepEqual(lensFiles(manifest, 'zod'), ['server/src/modules/widgets/routes.ts']);
  assert.deepEqual(lensFiles(manifest, 'react-best-practices'), ['client/src/app/_components/Card/Card.tsx']);
  assert.deepEqual(lensFiles(manifest, 'react-testing-library'), ['client/src/app/_components/Card/Card.test.tsx']);
  assert.ok(!lensFiles(manifest, 'frontend-architecture').some((file) => file.startsWith('server/')));
  assert.ok(!lensFiles(manifest, 'onion-architecture').some((file) => file.startsWith('client/')));
  assert.deepEqual(manifest.unroutedFiles, ['docs/notes.md']);
  assert.ok(!manifest.files.some((file) => file.path.startsWith('server/clones/')));
});

test('a skill that routing.json does not know is reported', (t) => {
  const repo = makeRepo(t);
  repo.write('.claude/skills/brand-new/SKILL.md', '# new\n');
  assert.deepEqual(collect(repo.options).unroutedSkills, ['brand-new']);
});

test('a docs-only change passes with no reviewer', (t) => {
  const repo = makeRepo(t);
  repo.write('docs/notes.md', '# notes\n');
  const manifest = collect(repo.options);
  assert.deepEqual(manifest.groups, []);
  assert.equal(finalize(repo.at).status, 'PASS');
  assert.deepEqual(decide(repo.at), { allow: true });
});

test('mechanical checks: migrations, shared copies, env files, CLAUDE.md', (t) => {
  const repo = makeRepo(t);
  repo.write('server/src/db/migrations/0001_next.sql', 'create table b (id int);\n');
  assert.deepEqual(rules(collect(repo.options)), []);

  repo.write('server/src/db/migrations/0000_init.sql', 'create table a (id bigint);\n');
  repo.write('server/src/vendor/shared/contracts/a.ts', 'export const A = 2;\n');
  repo.write('.env', 'OPENROUTER_API_KEY=whatever\n');
  fs.rmSync(path.join(repo.root, 'CLAUDE.md'));
  repo.write('CLAUDE.md', '# a copy\n');
  assert.deepEqual(rules(collect(repo.options)).sort(), [
    'repo/applied-migration-edited',
    'repo/claude-md-not-symlink',
    'repo/env-file-in-diff',
    'repo/shared-contract-one-copy',
  ]);
  assert.equal(finalize(repo.at).status, 'BLOCKED');

  repo.write('client/src/vendor/shared/contracts/a.ts', 'export const A = 2;\n');
  assert.ok(!rules(collect(repo.options)).includes('repo/shared-contract-one-copy'));
});

test('a key in an added line blocks, is never echoed, and can be suppressed in code', (t) => {
  const repo = makeRepo(t);
  const key = `ghp_${'a1B2'.repeat(9)}`;
  repo.write(SERVICE, `export const one = 1;\nexport const token = '${key}';\nexport const three = 3;\n`);
  const manifest = collect(repo.options);
  assert.deepEqual(rules(manifest), ['repo/secret-in-diff']);
  assert.equal(manifest.mechanical[0].line, 2);
  assert.ok(!JSON.stringify(manifest.mechanical).includes(key));

  repo.write(
    SERVICE,
    `export const one = 1;\n// pr-self-review-ignore: repo/secret-in-diff — fixture for the token parser\nexport const token = '${key}';\n`,
  );
  const next = collect(repo.options);
  const verdict = reviewAll(repo, next, null, []);
  assert.equal(verdict.status, 'PASS');
  assert.equal(verdict.suppressed[0].reason, 'fixture for the token parser');
});

test('deps:validate: a violation blocks, a tool failure leaves the review incomplete', (t) => {
  const repo = makeRepo(t);
  repo.write(SERVICE, 'export const one = 11;\n');
  const violating = collect({ ...repo.options, depsRunner: () => ({ ok: false, output: 'x 1 dependency violations (1 errors)' }) });
  assert.deepEqual(rules(violating), ['onion/deps-validate']);

  const broken = collect({ ...repo.options, depsRunner: () => ({ ok: false, output: 'pnpm: command not found' }) });
  assert.deepEqual(rules(broken), []);
  assert.equal(reviewAll(repo, broken, null, []).status, 'INCOMPLETE');

  const skipped = collect({ ...repo.options, runDeps: false });
  assert.equal(reviewAll(repo, skipped, null, []).status, 'INCOMPLETE');

  const clean = collect(repo.options);
  assert.equal(reviewAll(repo, clean, null, []).status, 'PASS');
});

test('a verified critical on a changed line blocks; on an old line it only warns', (t) => {
  const repo = makeRepo(t);
  repo.write(SERVICE, 'export const one = 1;\nexport const two = 22;\nexport const three = 3;\n');
  const manifest = collect(repo.options);

  const blocked = reviewAll(repo, manifest, 'backend-architecture', [critical()]);
  assert.equal(blocked.status, 'BLOCKED');
  assert.match(report(blocked), /BLOCKED — do not open or merge/);
  assert.equal(decide(repo.at).allow, false);

  record({
    ...repo.at,
    groupId: 'backend-architecture',
    input: { findings: [], dismissed: [{ rule: CRITICAL_RULE, file: SERVICE, line: 2, reason: 'it is wiring' }] },
  });
  assert.match(report(finalize(repo.at)), /dismissed on verification[\s\S]*it is wiring/);

  const old = reviewAll(repo, manifest, 'backend-architecture', [critical({ line: 3 })]);
  assert.equal(old.status, 'PASS_WITH_WARNINGS');
  assert.match(old.warnings[0].note, /pre-existing/);
  assert.deepEqual(decide(repo.at), { allow: true });
});

test('a critical needs a registered rule and a verification; a missing group is incomplete', (t) => {
  const repo = makeRepo(t);
  repo.write(SERVICE, 'export const one = 1;\nexport const two = 22;\nexport const three = 3;\n');
  const manifest = collect(repo.options);

  const unregistered = reviewAll(repo, manifest, 'backend-architecture', [critical({ rule: 'style/naming' })]);
  assert.equal(unregistered.status, 'PASS_WITH_WARNINGS');

  const unverified = reviewAll(repo, manifest, 'backend-architecture', [critical({ verified: false })]);
  assert.equal(unverified.status, 'INCOMPLETE');

  const malformed = reviewAll(repo, manifest, 'backend-architecture', [critical({ line: 0 }), critical({ file: 'nope.ts' })]);
  assert.equal(malformed.status, 'PASS');
  assert.equal(malformed.rejected.length, 2);

  assert.throws(() => record({ ...repo.at, groupId: 'backend-architecture', input: 'looks fine to me' }), /findings/);
  assert.throws(() => record({ ...repo.at, groupId: 'no-such-group', input: { findings: [] } }), /not a group/);
});

test('a group with no recorded review keeps the PR blocked', (t) => {
  const repo = makeRepo(t);
  repo.write(SERVICE, 'export const one = 11;\n');
  const manifest = collect(repo.options);
  record({ ...repo.at, groupId: manifest.groups[0].id, input: { findings: [] } });
  const verdict = finalize(repo.at);
  assert.equal(verdict.status, 'INCOMPLETE');
  assert.equal(decide(repo.at).allow, false);
});

test('an ignore comment with a reason suppresses a finding; one without a reason does not', (t) => {
  const repo = makeRepo(t);
  const deps = repo.options;
  repo.write(SERVICE, `export const one = 1;\n// pr-self-review-ignore: ${CRITICAL_RULE}\nexport const two = 22;\n`);
  let verdict = reviewAll(repo, collect(deps), 'backend-architecture', [critical({ line: 3 })]);
  assert.equal(verdict.status, 'BLOCKED');

  repo.write(SERVICE, `export const one = 1;\n// pr-self-review-ignore: ${CRITICAL_RULE} — wiring only, see ADR 7\nexport const two = 22;\n`);
  verdict = reviewAll(repo, collect(deps), 'backend-architecture', [critical({ line: 3 })]);
  assert.equal(verdict.status, 'PASS');
  assert.equal(verdict.suppressed.length, 1);
});

test('the verdict survives a commit and an amend, and dies with the next edit', (t) => {
  const repo = makeRepo(t);
  repo.write(SERVICE, 'export const one = 11;\n');
  repo.write('client/src/app/page.tsx', 'export default function Page() {\n  return 1;\n}\n');
  const manifest = collect(repo.options);
  assert.deepEqual(manifest.uncommitted.sort(), ['client/src/app/page.tsx', SERVICE]);
  assert.equal(reviewAll(repo, manifest, null, []).status, 'PASS');

  repo.commit('feature work');
  assert.deepEqual(decide(repo.at), { allow: true });
  repo.run('commit', '-q', '--amend', '-m', 'feature work, reworded');
  assert.deepEqual(decide(repo.at), { allow: true });

  repo.write('client/src/app/page.tsx', 'export default function Page() {\n  return 2;\n}\n');
  const denied = decide(repo.at);
  assert.equal(denied.allow, false);
  assert.match(denied.reason, /No pr-self-review verdict/);

  // Only the groups that saw the edited file need a new review.
  const before = new Map(manifest.groups.map((group) => [group.id, group.key]));
  const after = new Map(snapshot(repo.options).groups.map((group) => [group.id, group.key]));
  assert.equal(after.get('backend-architecture'), before.get('backend-architecture'));
  assert.notEqual(after.get('frontend-architecture'), before.get('frontend-architecture'));
});

test('the hook gates gh pr create and gh pr merge, and nothing else', () => {
  for (const command of [
    'gh pr create',
    'gh pr create --fill --base main',
    'git push -u origin feature && gh pr create --title "x"',
    'gh -R owner/repo pr merge 12 --squash',
    '(cd server && gh pr merge)',
  ]) {
    assert.ok(isGated(command), command);
  }
  for (const command of ['ls', 'gh pr view 12', 'gh pr checkout 12', 'gh pr list', 'git commit -m "pr created"', 'gh issue create', '']) {
    assert.ok(!isGated(command), command);
  }
  assert.ok(!isGated(undefined));
});

test('the hook denies when there is no verdict and stays out of the way outside a git repo', (t) => {
  const repo = makeRepo(t);
  repo.write(SERVICE, 'export const one = 11;\n');
  assert.equal(decide(repo.at).allow, false);

  const plain = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pr-self-review-plain-')));
  t.after(() => fs.rmSync(plain, { recursive: true, force: true }));
  assert.deepEqual(decide({ cwd: plain }), { allow: true });
});
