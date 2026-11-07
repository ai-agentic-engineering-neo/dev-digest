#!/usr/bin/env node
/**
 * Deterministic evals for the pr-self-review scripts (no LLM, no network, no node_modules).
 * Each case builds a throw-away git repo, makes a change, runs collect → checks --policy-only →
 * (fake agent output) → finalize merge/verdict → gate, and asserts the outcome.
 *
 *   node .claude/skills/pr-self-review/evals/run-deterministic.mjs [case-name-filter]
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SKILL_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPTS = join(SKILL_DIR, 'scripts');
const REAL_SKILLS = join(SKILL_DIR, '..');
const filter = process.argv[2];

const todayPlus = (days) => new Date(Date.now() + days * 864e5).toISOString().slice(0, 10);

const ROOTS = [];
function makeRepo(files) {
  const root = mkdtempSync(join(tmpdir(), 'prsr-eval-'));
  ROOTS.push(root);
  const g = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  g('init', '-q', '-b', 'main');
  g('config', 'user.email', 'eval@example.com');
  g('config', 'user.name', 'eval');
  g('config', 'core.autocrlf', 'false');
  // real SKILL.md files so routing sees the same skill set as the repo
  for (const s of readdirSync(REAL_SKILLS)) {
    const src = join(REAL_SKILLS, s, 'SKILL.md');
    if (!existsSync(src)) continue;
    mkdirSync(join(root, '.claude', 'skills', s), { recursive: true });
    cpSync(src, join(root, '.claude', 'skills', s, 'SKILL.md'));
  }
  writeFileSync(join(root, '.gitignore'), '.claude/pr-self-review/*\n!.claude/pr-self-review/waivers.json\n');
  const write = (fs) => {
    for (const [p, c] of Object.entries(fs)) {
      const abs = join(root, p);
      if (c === null) rmSync(abs, { force: true });
      else {
        mkdirSync(dirname(abs), { recursive: true });
        writeFileSync(abs, c);
      }
    }
  };
  write(files);
  g('add', '-A');
  g('commit', '-qm', 'base');
  g('checkout', '-qb', 'feat');
  return { root, g, write };
}

function script(root, name, args = [], input) {
  const r = spawnSync(process.execPath, [join(SCRIPTS, name), ...args], {
    cwd: root,
    encoding: 'utf8',
    input,
    env: { ...process.env, PR_SELF_REVIEW_ROOT: root, PR_SELF_REVIEW_BASE: 'main' },
  });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

const state = (root, p) => JSON.parse(readFileSync(join(root, '.claude', 'pr-self-review', p), 'utf8'));

/** Full pipeline. `agent(task)` returns the fake findings array for a task; `verify(f)` the verdict. */
function review(repo, { agent = () => [], verify = () => ({ confirmed: true }), collectArgs = [] } = {}) {
  const c = script(repo.root, 'collect-diff.mjs', collectArgs);
  if (c.code !== 0) throw new Error(`collect failed:\n${c.out}`);
  const plan = state(repo.root, 'run/plan.json');
  const k = script(repo.root, 'checks.mjs', ['--policy-only']);
  if (k.code !== 0) throw new Error(`checks failed:\n${k.out}`);
  for (const t of plan.tasks) writeFileSync(join(repo.root, t.outputPath), JSON.stringify(agent(t)));
  const m = script(repo.root, 'finalize.mjs', ['merge']);
  if (m.code !== 0) throw new Error(`merge failed:\n${m.out}`);
  const merged = state(repo.root, 'run/merged.json');
  for (const id of merged.needsVerification) {
    const f = merged.findings.find((x) => x.id === id);
    writeFileSync(join(repo.root, '.claude/pr-self-review/run/verify', `${id}.json`), JSON.stringify({ id, onChangedLine: true, ...verify(f) }));
  }
  const v = script(repo.root, 'finalize.mjs', ['verdict']);
  return { plan, merged, verdictCode: v.code, out: v.out, last: state(repo.root, 'last-run.json') };
}

const BASE = {
  'client/src/components/Badge.tsx': 'export function Badge() {\n  return null;\n}\n',
  'server/src/modules/reviews/service.ts': 'export class ReviewService {}\n',
  'server/src/db/schema/reviews.ts': 'export const reviews = {};\n',
  'server/src/db/migrations/0001_init.sql': 'create table reviews ();\n',
  'server/src/vendor/shared/contracts/finding.ts': "import { z } from 'zod';\nexport const Finding = z.object({});\n",
  'client/src/vendor/shared/contracts/finding.ts': "import { z } from 'zod';\nexport const Finding = z.object({});\n",
  'server/package.json': '{ "name": "server" }\n',
  'server/pnpm-lock.yaml': 'lockfileVersion: 9\n',
  'README.md': '# repo\n',
};

const VENDOR_NEXT = "import { z } from 'zod';\nexport const Finding = z.object({ id: z.string() });\n";
const vendorWaivers = () => JSON.stringify(['server', 'client'].map((pkg) => ({
  file: `${pkg}/src/vendor/shared/contracts/finding.ts`, rule: 'policy/do-not-touch-vendor-shared', reason: 'eval', expires: todayPlus(30),
})));

const finding = (task, file, line, severity, rule, issue = 'problem') => ({
  skill: task.skill, rule, file, line, severity, issue, evidence: 'x', fix: 'y',
});

const cases = {
  'docs-only → PASS, no skills'() {
    const r = makeRepo(BASE);
    r.write({ 'README.md': '# repo\nmore docs\n' });
    const res = review(r);
    assert(res.plan.tasks.length === 0, `expected 0 tasks, got ${res.plan.tasks.map((t) => t.id)}`);
    assert(res.last.verdict === 'PASS', res.out);
  },

  'UI change → only UI skills + security'() {
    const r = makeRepo(BASE);
    r.write({ 'client/src/components/Badge.tsx': 'export function Badge() {\n  return <span />;\n}\n' });
    const res = review(r);
    const skills = res.plan.tasks.map((t) => t.skill).sort();
    assert(JSON.stringify(skills) === JSON.stringify(['frontend-ui-architecture', 'next-best-practices', 'react-best-practices', 'security']), `skills: ${skills}`);
    assert(res.last.verdict === 'PASS', res.out);
  },

  'backend change → onion, not UI skills'() {
    const r = makeRepo(BASE);
    r.write({ 'server/src/modules/reviews/service.ts': "import { sql } from 'drizzle-orm';\nexport class ReviewService { q = sql; }\n" });
    const res = review(r);
    const skills = res.plan.tasks.map((t) => t.skill).sort();
    assert(skills.includes('onion-architecture') && skills.includes('drizzle-orm-patterns'), `skills: ${skills}`);
    assert(!skills.includes('react-best-practices') && !skills.includes('fastify-best-practices'), `skills: ${skills}`);
  },

  'vendor/shared edit → BLOCK (policy)'() {
    const r = makeRepo(BASE);
    r.write({ 'server/src/vendor/shared/contracts/finding.ts': "import { z } from 'zod';\nexport const Finding = z.object({ id: z.string() });\n" });
    const res = review(r);
    assert(res.last.verdict === 'BLOCK' && res.verdictCode === 1, res.out);
    assert(res.last.findings.some((f) => f.rules.includes('policy/do-not-touch-vendor-shared')), res.out);
  },

  'vendor/shared: ONE copy changed → non-waivable (waiver ignored)'() {
    const r = makeRepo(BASE);
    r.write({
      'server/src/vendor/shared/contracts/finding.ts': VENDOR_NEXT,
      '.claude/pr-self-review/waivers.json': vendorWaivers(),
    });
    const res = review(r);
    assert(res.last.verdict === 'BLOCK' && res.verdictCode === 1, res.out);
    const f = res.merged.findings.find((x) => x.rules.includes('policy/do-not-touch-vendor-shared'));
    assert(f && f.waivable === false && /only one copy changed/.test(f.issue), JSON.stringify(f));
    assert(res.last.warnings.some((w) => w.includes('cannot be waived')), res.out);
  },

  'vendor/shared: BOTH copies byte-identical → waivable (BLOCK without waiver, PASS with it)'() {
    const r = makeRepo(BASE);
    r.write({ 'server/src/vendor/shared/contracts/finding.ts': VENDOR_NEXT, 'client/src/vendor/shared/contracts/finding.ts': VENDOR_NEXT });
    const res = review(r);
    const fs = res.merged.findings.filter((x) => x.rules.includes('policy/do-not-touch-vendor-shared'));
    assert(fs.length === 2 && fs.every((f) => f.waivable === true), JSON.stringify(fs));
    assert(res.last.verdict === 'BLOCK', 'still a critical until the user waives it');
    r.write({ '.claude/pr-self-review/waivers.json': vendorWaivers() });
    const waived = review(r);
    assert(waived.last.verdict === 'PASS' && waived.last.waivedCount === 2, waived.out);
  },

  'vendor/shared: BOTH copies changed but different → non-waivable (waiver ignored)'() {
    const r = makeRepo(BASE);
    r.write({
      'server/src/vendor/shared/contracts/finding.ts': VENDOR_NEXT,
      'client/src/vendor/shared/contracts/finding.ts': VENDOR_NEXT.replace('z.string()', 'z.number()'),
      '.claude/pr-self-review/waivers.json': vendorWaivers(),
    });
    const res = review(r);
    const fs = res.merged.findings.filter((x) => x.rules.includes('policy/do-not-touch-vendor-shared'));
    assert(fs.length === 2 && fs.every((f) => f.waivable === false && /differ/.test(f.issue)), JSON.stringify(fs));
    assert(res.last.verdict === 'BLOCK' && res.last.warnings.some((w) => w.includes('cannot be waived')), res.out);
  },

  'vendor/shared: one copy DELETED, other changed → non-waivable'() {
    const r = makeRepo(BASE);
    r.write({ 'server/src/vendor/shared/contracts/finding.ts': VENDOR_NEXT, 'client/src/vendor/shared/contracts/finding.ts': null });
    const res = review(r);
    const fs = res.merged.findings.filter((x) => x.rules.includes('policy/do-not-touch-vendor-shared'));
    assert(fs.length === 2 && fs.every((f) => f.waivable === false), JSON.stringify(fs));
  },

  'migration + schema change → PASS'() {
    const r = makeRepo(BASE);
    r.write({ 'server/src/db/schema/reviews.ts': 'export const reviews = { id: 1 };\n', 'server/src/db/migrations/0002_id.sql': 'alter table reviews add id int;\n' });
    assert(review(r).last.verdict === 'PASS');
  },

  'migration without schema → BLOCK'() {
    const r = makeRepo(BASE);
    r.write({ 'server/src/db/migrations/0001_init.sql': 'create table reviews (id int);\n' });
    const res = review(r);
    assert(res.last.verdict === 'BLOCK' && res.last.findings.some((f) => f.rules.includes('policy/hand-edited-migration')), res.out);
  },

  'lockfile without manifest → BLOCK'() {
    const r = makeRepo(BASE);
    r.write({ 'server/pnpm-lock.yaml': 'lockfileVersion: 9\n# changed\n' });
    assert(review(r).last.verdict === 'BLOCK');
  },

  'confirmed LLM critical on changed line → BLOCK'() {
    const r = makeRepo(BASE);
    r.write({ 'client/src/components/Badge.tsx': 'export function Badge() {\n  const [a, setA] = useState(0);\n  return null;\n}\n' });
    const res = review(r, {
      agent: (t) => (t.skill === 'react-best-practices' ? [finding(t, 'client/src/components/Badge.tsx', 2, 'critical', 'react-best-practices/derive-dont-store')] : []),
    });
    assert(res.merged.needsVerification.length === 1, 'expected 1 critical to verify');
    assert(res.last.verdict === 'BLOCK' && res.last.criticalCount === 1, res.out);
  },

  'rejected by verifier → downgraded to high, PASS'() {
    const r = makeRepo(BASE);
    r.write({ 'client/src/components/Badge.tsx': 'export function Badge() {\n  const [a, setA] = useState(0);\n  return null;\n}\n' });
    const res = review(r, {
      agent: (t) => (t.skill === 'react-best-practices' ? [finding(t, 'client/src/components/Badge.tsx', 2, 'critical', 'react-best-practices/derive-dont-store')] : []),
      verify: () => ({ confirmed: false, reason: 'state is user input, not derived' }),
    });
    assert(res.last.verdict === 'PASS' && res.last.counts.high === 1, res.out);
  },

  'critical on unchanged line → pre-existing, PASS'() {
    const r = makeRepo({ ...BASE, 'client/src/components/Badge.tsx': 'export function Badge() {\n  return null;\n}\n// a\n// b\n// c\n' });
    r.write({ 'client/src/components/Badge.tsx': 'export function Badge() {\n  return null;\n}\n// a\n// b\n// c changed\n' });
    const res = review(r, {
      agent: (t) => (t.skill === 'react-best-practices' ? [finding(t, 'client/src/components/Badge.tsx', 1, 'critical', 'react-best-practices/old')] : []),
    });
    assert(res.merged.needsVerification.length === 0, 'pre-existing must not be verified');
    assert(res.last.verdict === 'PASS' && res.last.findings[0].status === 'pre-existing', res.out);
  },

  'dedupe: same line + rule from two skills → one finding'() {
    const r = makeRepo(BASE);
    r.write({ 'client/src/components/Badge.tsx': 'export function Badge() {\n  return <div dangerouslySetInnerHTML={{ __html: x }} />;\n}\n' });
    const res = review(r, {
      agent: (t) => (['react-best-practices', 'security'].includes(t.skill)
        ? [finding(t, 'client/src/components/Badge.tsx', 2, 'high', 'xss/dangerously-set-inner-html', 'unsanitized html rendered with dangerouslySetInnerHTML')]
        : []),
    });
    assert(res.last.findings.length === 1 && res.last.findings[0].skills.length === 2, JSON.stringify(res.last.findings, null, 1));
  },

  'valid waiver → PASS (waived)'() {
    const r = makeRepo(BASE);
    r.write({
      'client/src/components/Badge.tsx': 'export function Badge() {\n  const [a, setA] = useState(0);\n  return null;\n}\n',
      '.claude/pr-self-review/waivers.json': JSON.stringify([{ file: 'client/src/components/Badge.tsx', rule: 'react-best-practices/derive-dont-store', line: 2, reason: 'eval', expires: todayPlus(30) }]),
    });
    const res = review(r, {
      agent: (t) => (t.skill === 'react-best-practices' ? [finding(t, 'client/src/components/Badge.tsx', 2, 'critical', 'react-best-practices/derive-dont-store')] : []),
    });
    assert(res.last.verdict === 'PASS' && res.last.waivedCount === 1, res.out);
    assert(readFileSync(join(r.root, '.claude/pr-self-review/pr-summary.md'), 'utf8').includes('Waivers'), 'summary lists waivers');
  },

  'expired waiver → BLOCK + warning'() {
    const r = makeRepo(BASE);
    r.write({
      'client/src/components/Badge.tsx': 'export function Badge() {\n  const [a, setA] = useState(0);\n  return null;\n}\n',
      '.claude/pr-self-review/waivers.json': JSON.stringify([{ file: 'client/src/components/Badge.tsx', rule: 'react-best-practices/derive-dont-store', reason: 'eval', expires: '2020-01-01' }]),
    });
    const res = review(r, {
      agent: (t) => (t.skill === 'react-best-practices' ? [finding(t, 'client/src/components/Badge.tsx', 2, 'critical', 'react-best-practices/derive-dont-store')] : []),
    });
    assert(res.last.verdict === 'BLOCK' && res.last.warnings.some((w) => w.includes('expired')), res.out);
  },

  'waiver on server/clones → still BLOCK'() {
    const r = makeRepo(BASE);
    r.write({
      'server/clones/x/config': 'token=abc\n',
      '.claude/pr-self-review/waivers.json': JSON.stringify([{ file: 'server/clones/x/config', rule: 'policy/do-not-touch-clones', reason: 'eval', expires: todayPlus(30) }]),
    });
    const res = review(r);
    assert(res.last.verdict === 'BLOCK' && res.last.warnings.some((w) => w.includes('cannot be waived')), res.out);
  },

  'cache: re-run after changing 1 of 5 files reviews only that file'() {
    const files = Object.fromEntries([1, 2, 3, 4, 5].map((i) => [`client/src/components/C${i}.tsx`, `export const C${i} = () => null;\n`]));
    const r = makeRepo(BASE);
    r.write(Object.fromEntries(Object.entries(files).map(([p, c]) => [p, `${c}// v1\n`])));
    review(r);
    r.write({ 'client/src/components/C3.tsx': 'export const C3 = () => null;\n// v2\n' });
    const res = review(r);
    const reviewed = [...new Set(res.plan.tasks.flatMap((t) => t.files))];
    assert(reviewed.length === 1 && reviewed[0].endsWith('C3.tsx'), `reviewed: ${reviewed}`);
    assert(res.plan.cached.length === 16, `cached pairs: ${res.plan.cached.length}`); // 4 files × 4 skills
    const full = review(r, { collectArgs: ['--no-cache'] });
    assert(full.plan.cached.length === 0, '--no-cache must ignore the cache');
  },

  'cache survives untracked → staged → committed'() {
    const r = makeRepo(BASE);
    r.write({ 'client/src/components/New.tsx': 'export const New = () => null;\n' });
    review(r);
    r.g('add', '-A');
    const staged = review(r, { agent: () => { throw new Error('no agent expected after git add'); } });
    assert(staged.plan.tasks.length === 0, `tasks after add: ${staged.plan.tasks.map((t) => t.id)}`);
    r.g('commit', '-qm', 'wip');
    const committed = review(r, { agent: () => { throw new Error('no agent expected after commit'); } });
    assert(committed.plan.tasks.length === 0 && committed.last.verdict === 'PASS', committed.out);
  },

  'cached critical keeps blocking without re-verification'() {
    const r = makeRepo(BASE);
    r.write({ 'client/src/components/Badge.tsx': 'export function Badge() {\n  const [a, setA] = useState(0);\n  return null;\n}\n', 'README.md': '# x\n' });
    review(r, { agent: (t) => (t.skill === 'react-best-practices' ? [finding(t, 'client/src/components/Badge.tsx', 2, 'critical', 'react-best-practices/derive-dont-store')] : []) });
    r.write({ 'README.md': '# y\n' });
    const res = review(r, { agent: () => { throw new Error('no agent expected'); } });
    assert(res.merged.needsVerification.length === 0 && res.last.verdict === 'BLOCK', res.out);
  },

  'gate: open on PASS, closed when stale, hook JSON handling'() {
    const r = makeRepo(BASE);
    r.write({ 'client/src/components/Badge.tsx': 'export function Badge() {\n  return <b />;\n}\n' });
    const hook = (command) => script(r.root, 'gate.mjs', ['--claude-hook'], JSON.stringify({ tool_name: 'Bash', tool_input: { command } }));
    assert(hook('git push -u origin feat').code === 2, 'push without review must be blocked');
    review(r);
    assert(hook('git push -u origin feat').code === 0, 'push after PASS must pass');
    assert(script(r.root, 'gate.mjs', ['--git-hook'], 'refs/heads/feat abc refs/heads/feat 000\n').code === 0, 'git hook open');
    r.write({ 'client/src/components/Badge.tsx': 'export function Badge() {\n  return <i />;\n}\n' });
    const stale = hook('gh pr create --fill');
    assert(stale.code === 2 && stale.out.includes('stale'), stale.out);
    assert(hook('git status').code === 0, 'non-gated command must pass');
    assert(hook('git push origin --delete old-branch').code === 0, 'branch deletion must pass');
    assert(hook('gh pr create --fill && git push origin :old').code === 2, 'a deletion chained after a gated command must not open the gate');
    assert(hook('git push origin :old; git push -u origin feat').code === 2, 'a gated push chained after a deletion stays gated');
    assert(hook('git push origin feat :old').code === 2, 'a push that updates AND deletes refs stays gated');
    assert(hook('bash -c "git push origin feat"').code === 2, 'a quoted push is still gated');
    assert(hook('git push origin :old :older').code === 0, 'deleting several branches passes');
    assert(hook('git push origin feat # -d').code === 2, '-d inside a shell comment is not a deletion');
    assert(hook('git push -o -d origin feat').code === 2, '-d as an option value is not a deletion');
    assert(hook('git push -d origin old').code === 0, '-d before the remote deletes');
    const bad = script(r.root, 'gate.mjs', ['--claude-hook'], '{not json');
    assert(bad.code === 2 && bad.out.includes('fail closed'), 'malformed payload must fail closed');
    assert(script(r.root, 'gate.mjs', ['--git-hook'], 'refs/heads/feat abc refs/heads/feat 000\n').code === 1, 'git hook closed when stale');
  },

  'gate: committing a NEW (untracked) file keeps a PASS fresh'() {
    // Regression: untracked files used to be hashed raw next to `git diff`, so the commit that
    // added them changed the hash and the gate called a fresh PASS "stale".
    const r = makeRepo(BASE);
    r.write({ 'client/src/lib/new-helper.ts': 'export const x = 1;\r\n', 'client/src/components/Badge.tsx': 'export function Badge() {\n  return <u />;\n}\n' });
    review(r);
    const gate = () => script(r.root, 'gate.mjs', ['--git-hook'], 'refs/heads/feat abc refs/heads/feat 000\n');
    assert(gate().code === 0, 'gate open after PASS');
    r.g('add', '-A');
    assert(gate().code === 0, 'staging must not make the PASS stale');
    r.g('commit', '-qm', 'feat');
    assert(gate().code === 0, `committing must not make the PASS stale:\n${gate().out}`);
    assert(r.g('status', '--porcelain') === '', 'the hash must not touch the real index');
    r.write({ 'client/src/lib/new-helper.ts': 'export const x = 2;\n' });
    assert(gate().code === 1, 'editing the committed file makes it stale');
  },
};

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

let failed = 0;
for (const [name, fn] of Object.entries(cases)) {
  if (filter && !name.includes(filter)) continue;
  try {
    fn();
    console.log(`✔ ${name}`);
  } catch (e) {
    failed++;
    console.log(`✖ ${name}\n${String(e.message).split('\n').map((l) => `    ${l}`).join('\n')}`);
  }
}
console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
