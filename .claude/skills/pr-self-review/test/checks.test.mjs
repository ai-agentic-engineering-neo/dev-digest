// node --test '.claude/skills/pr-self-review/test/*.test.mjs'
import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { collect, loadMap, parseAddedLines } from '../scripts/collect.mjs';
import { runChecks, packagesToGate, defaultExec } from '../scripts/checks.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REAL_SKILLS_DIR = path.resolve(HERE, '..', '..');
const map = loadMap();

// Fake credentials are assembled at runtime so this file never trips the secret rule itself.
const FAKE_ANTHROPIC = `sk-ant-${'a1B2'.repeat(8)}`;
const FAKE_GENERIC = `Zx81Kq0p${'Lm42'.repeat(3)}`;

let repo;
const git = (...args) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const write = (rel, content) => {
  fs.mkdirSync(path.dirname(path.join(repo, rel)), { recursive: true });
  fs.writeFileSync(path.join(repo, rel), content);
};
const plan = () => collect({ repo, base: 'main', fetch: false, map, skillsDir: REAL_SKILLS_DIR });
const node = (code) => ['node', '-e', code];
const PASS = node('process.exit(0)');
const FAIL_TS = node("console.error('src/a.ts(1,7): error TS2322: Type string is not assignable to type number.'); process.exit(2)");

function gatesWith({ client = [PASS], server = [PASS] } = {}) {
  const cmds = (list) => list.map((argv, i) => ({ name: ['lint', 'typecheck', 'test'][i] ?? `cmd${i}`, argv }));
  return {
    client: { triggers: ['client/**'], commands: cmds(client) },
    server: { triggers: ['server/**', 'reviewer-core/src/**'], commands: cmds(server) },
  };
}

beforeEach(() => {
  repo = fs.mkdtempSync(path.join(os.tmpdir(), 'prsr-checks-'));
  git('init', '--quiet', '--initial-branch=main');
  git('config', 'user.email', 'test@example.invalid');
  git('config', 'user.name', 'test');
  git('config', 'commit.gpgsign', 'false');
  write('.gitignore', 'node_modules/\n.devdigest/cache/\n');
  write('client/package.json', JSON.stringify({ name: 'client', scripts: { test: 'vitest' }, dependencies: { react: '19.0.0' } }, null, 2));
  write('client/pnpm-lock.yaml', 'lockfileVersion: 9.0\n');
  write('client/src/a.ts', 'export const a = 1;\n');
  write('server/package.json', JSON.stringify({ name: 'server' }, null, 2));
  write('server/src/b.ts', 'export const b = 1;\n');
  write('server/src/vendor/shared/index.ts', 'export {};\n');
  write('client/src/vendor/shared/index.ts', 'export {};\n');
  write('reviewer-core/src/c.ts', 'export const c = 1;\n');
  fs.mkdirSync(path.join(repo, 'client/node_modules'), { recursive: true });
  fs.mkdirSync(path.join(repo, 'server/node_modules'), { recursive: true });
  git('add', '-A');
  git('commit', '--quiet', '-m', 'base');
  git('checkout', '--quiet', '-b', 'feature');
});
afterEach(() => fs.rmSync(repo, { recursive: true, force: true }));

describe('parseAddedLines', () => {
  test('returns new-file line numbers across hunks', () => {
    const diff = [
      'diff --git a/x b/x', '--- a/x', '+++ b/x',
      '@@ -1,3 +1,4 @@', ' one', '+two', ' three', '-gone', '+four',
      '@@ -10,2 +11,3 @@', ' ten', '+eleven-new', ' twelve',
    ].join('\n');
    assert.deepEqual(parseAddedLines(diff), [
      { line: 2, text: 'two' }, { line: 4, text: 'four' }, { line: 12, text: 'eleven-new' },
    ]);
  });
});

describe('packagesToGate', () => {
  test('only touched packages; reviewer-core sources also gate server; docs-only changes gate nothing', () => {
    const p = (paths) => ({ files: paths.map((x) => ({ path: x })) });
    assert.deepEqual(packagesToGate(p(['client/src/a.ts'])), ['client']);
    assert.deepEqual(packagesToGate(p(['reviewer-core/src/c.ts'])), ['server', 'reviewer-core']);
    assert.deepEqual(packagesToGate(p(['client/INSIGHTS.md', 'docs/x.md'])), []);
    assert.deepEqual(packagesToGate(p(['e2e/run.ts'])), ['e2e']);
  });
});

describe('package gates', () => {
  test('a failing typecheck becomes a CRITICAL with the compiler output; untouched server is not run', () => {
    write('client/src/a.ts', 'export const a: number = "x";\n');
    const ran = [];
    const exec = (argv, cwd) => { ran.push(path.basename(cwd)); return defaultExec(argv, cwd); };
    const report = runChecks({ plan: plan(), gates: gatesWith({ client: [PASS, FAIL_TS, PASS] }), exec });

    assert.equal(report.status, 'fail');
    assert.deepEqual(report.packagesGated, ['client']);
    assert.ok(ran.every((d) => d === 'client'), `ran in ${ran.join(', ')}`);
    const crit = report.findings.filter((f) => f.severity === 'CRITICAL');
    assert.equal(crit.length, 1);
    assert.equal(crit[0].rule, 'gate/typecheck');
    assert.match(crit[0].evidence, /TS2322/);
    assert.equal(report.results.find((r) => r.name === 'typecheck').exitCode, 2);
    assert.equal(report.results.find((r) => r.kind === 'command' && r.name === 'test').status, 'pass');
  });

  test('missing node_modules makes the report incomplete, not a CRITICAL', () => {
    fs.rmSync(path.join(repo, 'client/node_modules'), { recursive: true });
    write('client/src/a.ts', 'export const a = 2;\n');
    const report = runChecks({ plan: plan(), gates: gatesWith() });
    assert.equal(report.status, 'incomplete');
    assert.equal(report.counts.CRITICAL, 0);
    assert.match(report.results.find((r) => r.kind === 'command').reason, /node_modules is missing/);
  });

  test('fail-fast skips the remaining gates after the first CRITICAL', () => {
    write('client/src/a.ts', 'export const a = 2;\n');
    write('server/src/b.ts', 'export const b = 2;\n');
    const report = runChecks({ plan: plan(), gates: gatesWith({ client: [FAIL_TS, PASS], server: [PASS] }), failFast: true });
    const cmds = report.results.filter((r) => r.kind === 'command');
    assert.deepEqual(cmds.map((r) => `${r.package}:${r.status}`), ['client:fail', 'client:skipped', 'server:skipped']);
  });

  test('all gates pass → status pass', () => {
    write('server/src/b.ts', 'export const b = 2;\n');
    const report = runChecks({ plan: plan(), gates: gatesWith() });
    assert.equal(report.status, 'pass');
    assert.deepEqual(report.packagesGated, ['server']);
  });
});

describe('repo rules', () => {
  const rulesOnly = () => runChecks({ plan: plan(), gates: {}, skipGates: true });
  const byRule = (report, rule) => report.findings.filter((f) => f.rule === rule);

  test('contract drift: changing only one vendored copy is CRITICAL; syncing both passes', () => {
    write('server/src/vendor/shared/index.ts', 'export const v = 1;\n');
    let found = byRule(rulesOnly(), 'repo/contract-drift');
    assert.equal(found.length, 1);
    assert.equal(found[0].severity, 'CRITICAL');
    assert.match(found[0].evidence, /index\.ts/);
    write('client/src/vendor/shared/index.ts', 'export const v = 1;\n');
    found = byRule(rulesOnly(), 'repo/contract-drift');
    assert.equal(found.length, 0);
  });

  test('package-manager mix: package-lock.json in a pnpm package is CRITICAL', () => {
    write('client/package-lock.json', '{}\n');
    const found = byRule(rulesOnly(), 'repo/package-manager-mix');
    assert.equal(found.length, 1);
    assert.equal(found[0].file, 'client/package-lock.json');
    assert.equal(found[0].severity, 'CRITICAL');
  });

  test('lockfile sync: dependency change without the lockfile is a WARNING; scripts-only change is fine', () => {
    write('client/package.json', JSON.stringify({ name: 'client', scripts: { test: 'vitest run' }, dependencies: { react: '19.0.0' } }, null, 2));
    assert.equal(byRule(rulesOnly(), 'repo/lockfile-sync').length, 0);
    write('client/package.json', JSON.stringify({ name: 'client', scripts: { test: 'vitest run' }, dependencies: { react: '19.1.0' } }, null, 2));
    const found = byRule(rulesOnly(), 'repo/lockfile-sync');
    assert.equal(found.length, 1);
    assert.equal(found[0].severity, 'WARNING');
    assert.match(found[0].evidence, /dependencies/);
    write('client/pnpm-lock.yaml', 'lockfileVersion: 9.0\n# bumped\n');
    assert.equal(byRule(rulesOnly(), 'repo/lockfile-sync').length, 0);
  });

  test('secrets: a real-looking key is CRITICAL with its line, redacted; the allow marker and .env.example pass', () => {
    write('server/src/b.ts', `export const b = 1;\nconst key = '${FAKE_ANTHROPIC}';\n`);
    let found = byRule(rulesOnly(), 'repo/secret');
    assert.equal(found.length, 1);
    assert.equal(found[0].line, 2);
    assert.ok(!found[0].evidence.includes(FAKE_ANTHROPIC), 'evidence must be redacted');
    write('server/src/b.ts', `export const b = 1;\nconst key = '${FAKE_ANTHROPIC}'; // pr-self-review: allow-secret\n`);
    assert.equal(byRule(rulesOnly(), 'repo/secret').length, 0);
    write('server/src/b.ts', `export const b = 1;\nconst x = { secret: 'repo/secret-like-value' };\nconst apiKey = '${FAKE_GENERIC}';\n`);
    found = rulesOnly().findings.filter((f) => f.rule === 'repo/secret-like');
    assert.deepEqual(found.map((f) => f.line), [3], 'identifier-like values are not credentials; mixed letters+digits are');
    write('server/src/b.ts', 'export const b = 1;\n');
    write('.env.example', 'ANTHROPIC_API_KEY=\n');
    assert.equal(byRule(rulesOnly(), 'repo/secret-file').length, 0);
    write('server/.env', 'X=1\n');
    git('add', '-f', 'server/.env');
    found = byRule(rulesOnly(), 'repo/secret-file');
    assert.equal(found.length, 1);
    assert.equal(found[0].severity, 'CRITICAL');
  });

  test('english-only: Cyrillic in docs and comments is a WARNING; skills, strings and i18n are exempt', () => {
    write('docs/notes.md', '# Notes\n\nЦе нотатка.\n');
    write('server/src/b.ts', "export const b = 1; // коментар\nexport const label = 'рядок';\n");
    write('.claude/skills/x/SKILL.md', 'Triggers - "куди покласти"\n');
    write('client/messages/uk/common.json', '{ "hi": "привіт" }\n');
    const found = byRule(rulesOnly(), 'repo/english-only');
    assert.deepEqual(found.map((f) => f.file).sort(), ['docs/notes.md', 'server/src/b.ts']);
    assert.ok(found.every((f) => f.severity === 'WARNING'));
    assert.equal(found.find((f) => f.file === 'server/src/b.ts').line, 1);
  });

  test('a clean change produces no rule findings and a pass', () => {
    write('server/src/b.ts', 'export const b = 2;\n');
    const report = rulesOnly();
    assert.equal(report.findings.length, 0);
    assert.equal(report.status, 'pass');
    assert.ok(report.results.every((r) => r.kind === 'rule' && r.status === 'pass'));
  });
});
