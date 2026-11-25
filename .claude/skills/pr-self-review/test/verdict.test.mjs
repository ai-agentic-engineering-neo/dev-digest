// node --test '.claude/skills/pr-self-review/test/*.test.mjs'
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { collect, loadMap, runDir } from '../scripts/collect.mjs';
import { runChecks } from '../scripts/checks.mjs';
import { buildUnits, writeUnits, writeCriticals, fill } from '../scripts/units.mjs';
import { normalizeSeverity, normalizeFinding, findingId } from '../scripts/findings.mjs';
import { buildVerdict, verdictForRun, formatMarkdown } from '../scripts/verdict.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPTS = path.resolve(HERE, '..', 'scripts');
const REAL_SKILLS_DIR = path.resolve(HERE, '..', '..');
const map = loadMap();

// ---------- synthetic inputs ----------

const HASH = 'a'.repeat(64);
const plan0 = (extra = {}) => ({
  diffHash: HASH, head: 'h', branch: 'feature', base: { ref: 'main', sha: 'b' }, mergeBase: 'm', repo: '/repo', empty: false,
  files: [
    { path: 'server/src/modules/x/service.ts', package: 'server', additions: 10, deletions: 0 },
    { path: 'client/src/app/page.tsx', package: 'client', additions: 5, deletions: 1 },
  ],
  units: [],
  ...extra,
});
const checksOk = (extra = {}) => ({ diffHash: HASH, status: 'pass', packagesGated: ['server'], results: [], findings: [], ...extra });
const unitsJson0 = { diffHash: HASH, selected: [{ id: 'U01', skill: 'onion-architecture', maxSeverity: 'CRITICAL', files: ['server/src/modules/x/service.ts'] }], skipped: [] };
const crit = (extra = {}) => normalizeFinding({
  severity: 'CRITICAL', rule: 'inward-only', file: 'server/src/modules/x/service.ts', line: 3,
  title: 'service imports drizzle', evidence: "import { db } from '../../db/client'", fix: 'use a repository port', ...extra,
}, { unit: 'U01', skill: 'onion-architecture', maxSeverity: 'CRITICAL' });
const unitResults = (findings, status = 'done') => ({ results: { U01: { status, count: findings.length } }, findings });
const verdictOf = (o) => buildVerdict({ plan: plan0(), checks: checksOk(), unitsJson: unitsJson0, ...o });

describe('severity normalization', () => {
  test('aliases map onto the product enum and maxSeverity clamps', () => {
    assert.equal(normalizeSeverity('high'), 'WARNING');
    assert.equal(normalizeSeverity('MEDIUM'), 'WARNING');
    assert.equal(normalizeSeverity('low'), 'SUGGESTION');
    assert.equal(normalizeSeverity('nonsense'), 'SUGGESTION');
    assert.equal(normalizeSeverity('CRITICAL', 'WARNING'), 'WARNING');
    assert.equal(normalizeSeverity('SUGGESTION', 'WARNING'), 'SUGGESTION');
  });
  test('finding ids are stable and depend on location + title', () => {
    assert.equal(crit().id, crit().id);
    assert.notEqual(crit().id, crit({ line: 4 }).id);
    assert.match(crit().id, /^F-[0-9a-f]{8}$/);
    assert.equal(findingId({ source: 'checks', rule: 'r', title: 'T ' }), findingId({ source: 'checks', rule: 'r', title: 't' }));
  });
});

describe('buildVerdict', () => {
  test('a confirmed CRITICAL blocks', () => {
    const f = crit();
    const v = verdictOf({ unitResults: unitResults([f]), verifications: new Map([[f.id, { decision: 'confirmed', reason: 'yes' }]]) });
    assert.equal(v.verdict, 'BLOCK');
    assert.deepEqual(v.blocking, [f.id]);
  });
  test('an unverified CRITICAL still blocks (fail safe) and is marked', () => {
    const v = verdictOf({ unitResults: unitResults([crit()]) });
    assert.equal(v.verdict, 'BLOCK');
    assert.equal(v.findings[0].unverified, true);
  });
  test('a rejected CRITICAL does not block and is listed as rejected', () => {
    const f = crit();
    const v = verdictOf({ unitResults: unitResults([f]), verifications: new Map([[f.id, { decision: 'reject', reason: 'pre-existing' }]]) });
    assert.equal(v.verdict, 'PASS');
    assert.equal(v.rejected.length, 1);
    assert.equal(v.counts.CRITICAL, 0);
  });
  test('a downgraded CRITICAL becomes a WARNING', () => {
    const f = crit();
    const v = verdictOf({ unitResults: unitResults([f]), verifications: new Map([[f.id, { decision: 'downgrade', reason: 'should, not must' }]]) });
    assert.equal(v.verdict, 'PASS');
    assert.equal(v.counts.WARNING, 1);
  });
  test('WARNINGs never block, however many', () => {
    const many = Array.from({ length: 30 }, (_, i) => crit({ severity: 'WARNING', line: i + 1 }));
    assert.equal(verdictOf({ unitResults: unitResults(many) }).verdict, 'PASS');
  });
  test('a waiver with a reason turns BLOCK into PASS; an empty reason does not', () => {
    const f = crit();
    assert.equal(verdictOf({ unitResults: unitResults([f]), waivers: [{ id: f.id, reason: '  ' }] }).verdict, 'BLOCK');
    const v = verdictOf({ unitResults: unitResults([f]), waivers: [{ id: f.id, reason: 'false positive: adapter file', at: 't' }] });
    assert.equal(v.verdict, 'PASS');
    assert.equal(v.waived[0].reason, 'false positive: adapter file');
  });
  test('pre-existing findings and files outside the diff are out of scope', () => {
    const v = verdictOf({ unitResults: unitResults([crit({ introducedByDiff: false }), crit({ file: 'server/src/other.ts' })]) });
    assert.equal(v.verdict, 'PASS');
    assert.equal(v.info.length, 2);
  });
  test('deterministic CRITICALs block without verification', () => {
    const checks = checksOk({ status: 'fail', findings: [{ severity: 'CRITICAL', rule: 'gate/typecheck', package: 'server', title: 'server: `typecheck` fails', evidence: 'TS2322' }] });
    const v = verdictOf({ checks, unitResults: unitResults([]) });
    assert.equal(v.verdict, 'BLOCK');
    assert.equal(v.findings[0].source, 'checks');
  });
  test('fail-fast: no units + checks CRITICAL → BLOCK with a note; no units + clean checks → INCOMPLETE', () => {
    const checks = checksOk({ status: 'fail', findings: [{ severity: 'CRITICAL', rule: 'repo/secret', file: 'a.ts', line: 1, title: 'key' }] });
    const v = buildVerdict({ plan: plan0(), checks, unitsJson: null });
    assert.equal(v.verdict, 'BLOCK');
    assert.match(v.notes.join(), /fail-fast/);
    assert.equal(buildVerdict({ plan: plan0(), checks: checksOk(), unitsJson: null }).verdict, 'INCOMPLETE');
  });
  test('a missing reviewer result or a check that could not run → INCOMPLETE; BLOCK wins over INCOMPLETE', () => {
    assert.equal(verdictOf({ unitResults: { results: { U01: { status: 'missing' } }, findings: [] } }).verdict, 'INCOMPLETE');
    const checks = checksOk({ status: 'incomplete', results: [{ kind: 'command', package: 'client', name: 'lint', status: 'error', reason: 'client/node_modules is missing' }] });
    const v = verdictOf({ checks, unitResults: unitResults([]) });
    assert.equal(v.verdict, 'INCOMPLETE');
    assert.match(v.incomplete.join(), /node_modules/);
    assert.equal(verdictOf({ checks, unitResults: unitResults([crit()]) }).verdict, 'BLOCK');
  });
  test('artifacts of another diff are not trusted', () => {
    const v = verdictOf({ checks: checksOk({ diffHash: 'b'.repeat(64) }), unitResults: unitResults([]) });
    assert.equal(v.verdict, 'INCOMPLETE');
  });
  test('empty diff → PASS', () => {
    assert.equal(buildVerdict({ plan: plan0({ empty: true, files: [] }) }).verdict, 'PASS');
  });
  test('markdown report lists the blocking finding and a PR summary', () => {
    const md = formatMarkdown(verdictOf({ unitResults: unitResults([crit()]) }));
    assert.match(md, /BLOCK/);
    assert.match(md, /service imports drizzle/);
    assert.match(md, /PR summary/);
  });
});

describe('buildUnits', () => {
  const plan = plan0({
    files: [
      { path: 'server/a.ts', additions: 900, deletions: 0 },
      { path: 'server/b.ts', additions: 900, deletions: 0 },
      { path: 'server/c.ts', additions: 10, deletions: 0 },
      { path: 'client/x.tsx', additions: 10, deletions: 0 },
    ],
    units: [
      { skill: 'typescript-expert', priority: 6, files: ['server/a.ts', 'client/x.tsx'] },
      { skill: 'onion-architecture', priority: 1, files: ['server/a.ts', 'server/b.ts', 'server/c.ts'] },
      { skill: 'security', priority: 2, files: ['server/c.ts'] },
    ],
  });
  test('splits by changed lines, orders by priority, numbers the units', () => {
    const { selected, skipped } = buildUnits(plan, { maxLines: 1500 });
    assert.deepEqual(selected.map((u) => `${u.id} ${u.skill} ${u.files.length}`), [
      'U01 onion-architecture 1', 'U02 onion-architecture 2', 'U03 security 1', 'U04 typescript-expert 2',
    ]);
    assert.equal(skipped.length, 0);
  });
  test('the agent cap keeps the highest-priority units', () => {
    const { selected, skipped } = buildUnits(plan, { maxLines: 1500, cap: 2 });
    assert.deepEqual(selected.map((u) => u.skill), ['onion-architecture', 'onion-architecture']);
    assert.deepEqual(skipped.map((u) => u.skill), ['security', 'typescript-expert']);
  });
  test('fill replaces known placeholders only', () => {
    assert.equal(fill('{{A}} {{B}} {{lower}}', { A: 1 }), '1 {{B}} {{lower}}');
  });
});

describe('end to end on a fixture repository (scripts only, reviewer output simulated)', () => {
  test('collect → checks → units → findings → criticals → verify → verdict → waive', () => {
    const repo = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'prsr-e2e-')));
    const git = (...a) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    const write = (rel, c) => { fs.mkdirSync(path.dirname(path.join(repo, rel)), { recursive: true }); fs.writeFileSync(path.join(repo, rel), c); };
    try {
      git('init', '--quiet', '--initial-branch=main');
      git('config', 'user.email', 'test@example.invalid'); git('config', 'user.name', 't'); git('config', 'commit.gpgsign', 'false');
      write('.gitignore', '.devdigest/cache/\n');
      write('server/src/modules/x/service.ts', 'export const x = 1;\n');
      write('client/src/app/page.tsx', 'export default function P() { return null; }\n');
      git('add', '-A'); git('commit', '--quiet', '-m', 'base'); git('checkout', '--quiet', '-b', 'feature');
      write('server/src/modules/x/service.ts', "import { db } from '../../db/client';\nexport const x = db;\n");
      write('client/src/app/page.tsx', "'use client';\nexport default function P() { return null; }\n");

      const plan = collect({ repo, base: 'main', fetch: false, map, skillsDir: REAL_SKILLS_DIR });
      const run = runDir(repo, plan.diffHash);
      fs.mkdirSync(run, { recursive: true });
      fs.writeFileSync(path.join(run, 'plan.json'), JSON.stringify(plan));
      fs.writeFileSync(path.join(run, 'checks.json'), JSON.stringify(runChecks({ plan, gates: {}, skipGates: true })));

      const units = writeUnits(run, plan);
      const onion = units.selected.find((u) => u.skill === 'onion-architecture');
      const front = units.selected.find((u) => u.skill === 'frontend-ui-architecture');
      assert.ok(onion && front, 'both sides get their architecture skill');
      assert.deepEqual(onion.files, ['server/src/modules/x/service.ts']);
      assert.deepEqual(front.files, ['client/src/app/page.tsx']);
      const prompt = fs.readFileSync(onion.prompt, 'utf8');
      assert.match(prompt, /onion-architecture\/SKILL\.md/);
      assert.match(prompt, /server\/CLAUDE\.md|CLAUDE\.md/);
      assert.ok(!/\{\{[A-Z_]+\}\}/.test(prompt), 'no unfilled placeholders');
      assert.match(fs.readFileSync(path.join(run, 'units', `${onion.id}.diff`), 'utf8'), /\+import \{ db \}/);

      // simulate reviewers: onion finds a CRITICAL, everyone else nothing
      for (const u of units.selected) {
        const findings = u.id === onion.id ? [{ severity: 'CRITICAL', rule: 'inward-only', file: 'server/src/modules/x/service.ts', line: 1, title: 'service imports the db client', evidence: "import { db } from '../../db/client';", fix: 'inject a repository' }] : [];
        fs.writeFileSync(u.output, JSON.stringify({ unit: u.id, skill: u.skill, status: 'done', findings }));
      }
      const { criticals } = writeCriticals(run);
      assert.equal(criticals.length, 1);
      const vPrompt = fs.readFileSync(criticals[0].prompt, 'utf8');
      assert.match(vPrompt, /service imports the db client/);
      assert.ok(!/\{\{[A-Z_]+\}\}/.test(vPrompt));

      assert.equal(verdictForRun(run).verdict, 'BLOCK'); // unverified → blocks
      fs.writeFileSync(criticals[0].output, JSON.stringify({ id: criticals[0].id, decision: 'confirmed', reason: 'domain-ish service imports db' }));
      assert.equal(verdictForRun(run).verdict, 'BLOCK');

      // CLI: verdict exits 3, waive without reason fails, waive with reason → PASS (exit 0)
      const cli = (...a) => spawnSync('node', [path.join(SCRIPTS, 'verdict.mjs'), ...a, '--repo', repo, '--base', 'main', '--no-fetch', '--skills-dir', REAL_SKILLS_DIR], { encoding: 'utf8' });
      let r = cli();
      assert.equal(r.status, 3, r.stderr + r.stdout);
      assert.match(r.stdout, /BLOCK/);
      assert.ok(fs.existsSync(path.join(repo, '.devdigest/cache/pr-self-review/verdicts', `${plan.diffHash}.json`)));
      r = cli('waive', criticals[0].id);
      assert.equal(r.status, 1);
      r = cli('waive', criticals[0].id, 'accepted for the spike, ticket DD-1');
      assert.equal(r.status, 0, r.stderr + r.stdout);
      assert.match(r.stdout, /PASS/);

      // any edit makes the run stale; the CLI refuses it
      write('server/src/modules/x/service.ts', 'export const x = 2;\n');
      r = cli();
      assert.equal(r.status, 1);
      assert.match(r.stderr, /No review run for the current diff/);
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });
});
