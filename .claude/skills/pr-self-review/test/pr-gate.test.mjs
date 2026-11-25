// node --test '.claude/skills/pr-self-review/test/*.test.mjs'
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { splitShell, detectGated, evaluateGate } from '../hooks/pr-gate.mjs';
import { collect, loadMap } from '../scripts/collect.mjs';
import { verdictPath } from '../scripts/verdict.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HOOK = path.resolve(HERE, '..', 'hooks', 'pr-gate.mjs');
const REAL_SKILLS_DIR = path.resolve(HERE, '..', '..');
const map = loadMap();

describe('splitShell', () => {
  test('splits on operators and respects quotes', () => {
    assert.deepEqual(splitShell(`cd a && gh pr create --title "x && y" | cat; echo 'a;b'`), [
      ['cd', 'a'], ['gh', 'pr', 'create', '--title', 'x && y'], ['cat'], ['echo', 'a;b'],
    ]);
  });
});

describe('detectGated', () => {
  const at = (cmd) => detectGated(cmd, '/repo');
  const cases = [
    ['gh pr create --fill', { kind: 'pr-create', cwd: '/repo' }],
    ['GH_TOKEN=x env gh pr create', { kind: 'pr-create', cwd: '/repo' }],
    ['gh --repo fojor/dev-digest pr create --base main', { kind: 'pr-create', cwd: '/repo' }],
    ['cd client && gh pr create', { kind: 'pr-create', cwd: '/repo/client' }],
    ['npx -y pnpm@10 test && gh pr create --title "feat: x" --body "$(cat body.md)"', { kind: 'pr-create', cwd: '/repo' }],
    ['/opt/homebrew/bin/gh pr create', { kind: 'pr-create', cwd: '/repo' }],
    ['git push', { kind: 'push', cwd: '/repo' }],
    ['git push -u origin feature', { kind: 'push', cwd: '/repo' }],
    ['git -C ../other push origin HEAD', { kind: 'push', cwd: '/other' }],
    ['git -c core.x=1 push --force-with-lease', { kind: 'push', cwd: '/repo' }],
    ['git add -A && git commit -m "push it" && git push', { kind: 'push', cwd: '/repo' }],
  ];
  for (const [cmd, expected] of cases) test(`gated: ${cmd}`, () => assert.deepEqual(at(cmd), expected));

  const free = [
    'gh pr view', 'gh pr list', 'gh pr create --help', 'gh issue create --title "pr create"',
    'git push --dry-run', 'git push origin --delete old', 'git push origin :old', 'git status',
    'echo "gh pr create"', 'git log --grep push', 'grep -r "git push" docs',
  ];
  for (const cmd of free) test(`not gated: ${cmd}`, () => assert.equal(at(cmd), null));
});

// ---------- evaluateGate on a fixture repo ----------

function fixture() {
  const repo = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'prsr-gate-')));
  const git = (...a) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  git('init', '--quiet', '--initial-branch=main');
  git('config', 'user.email', 'test@example.invalid'); git('config', 'user.name', 't'); git('config', 'commit.gpgsign', 'false');
  fs.writeFileSync(path.join(repo, '.gitignore'), '.devdigest/cache/\n');
  fs.mkdirSync(path.join(repo, 'server/src'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'server/src/a.ts'), 'export const a = 1;\n');
  git('add', '-A'); git('commit', '--quiet', '-m', 'base'); git('checkout', '--quiet', '-b', 'feature');
  fs.writeFileSync(path.join(repo, 'server/src/a.ts'), 'export const a = 2;\n');
  const plan = () => collect({ repo, base: 'main', fetch: false, map, skillsDir: REAL_SKILLS_DIR });
  const writeVerdict = (v) => {
    const p = plan();
    const file = verdictPath(repo, p.diffHash);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ diffHash: p.diffHash, blocking: [], findings: [], incomplete: [], ...v }));
  };
  return { repo, plan, writeVerdict, cleanup: () => fs.rmSync(repo, { recursive: true, force: true }) };
}

describe('evaluateGate', () => {
  test('no verdict → deny and tell the agent to run the skill', () => {
    const f = fixture();
    try {
      const d = evaluateGate({ kind: 'pr-create', cwd: f.repo }, { plan: f.plan });
      assert.equal(d.allow, false);
      assert.match(d.reason, /\/pr-self-review/);
    } finally { f.cleanup(); }
  });

  test('PASS for the current diff → allow; an edit after it → deny again', () => {
    const f = fixture();
    try {
      f.writeVerdict({ verdict: 'PASS' });
      assert.deepEqual(evaluateGate({ kind: 'pr-create', cwd: f.repo }, { plan: f.plan }), { allow: true });
      fs.writeFileSync(path.join(f.repo, 'server/src/a.ts'), 'export const a = 3;\n');
      assert.equal(evaluateGate({ kind: 'pr-create', cwd: f.repo }, { plan: f.plan }).allow, false);
    } finally { f.cleanup(); }
  });

  test('BLOCK → deny listing the blocking findings and the waive command', () => {
    const f = fixture();
    try {
      f.writeVerdict({ verdict: 'BLOCK', blocking: ['F-12345678'], findings: [{ id: 'F-12345678', file: 'server/src/a.ts', line: 1, title: 'command injection' }] });
      const d = evaluateGate({ kind: 'pr-create', cwd: f.repo }, { plan: f.plan });
      assert.equal(d.allow, false);
      assert.match(d.reason, /F-12345678 server\/src\/a\.ts:1 — command injection/);
      assert.match(d.reason, /verdict\.mjs waive/);
    } finally { f.cleanup(); }
  });

  test('INCOMPLETE → deny with the reasons', () => {
    const f = fixture();
    try {
      f.writeVerdict({ verdict: 'INCOMPLETE', incomplete: ['check client: lint could not run — client/node_modules is missing'] });
      const d = evaluateGate({ kind: 'pr-create', cwd: f.repo }, { plan: f.plan });
      assert.equal(d.allow, false);
      assert.match(d.reason, /node_modules is missing/);
    } finally { f.cleanup(); }
  });

  test('push: gated only when the branch has an open PR', () => {
    const f = fixture();
    try {
      assert.deepEqual(evaluateGate({ kind: 'push', cwd: f.repo }, { plan: f.plan, openPr: () => false }), { allow: true });
      assert.equal(evaluateGate({ kind: 'push', cwd: f.repo }, { plan: f.plan, openPr: () => true }).allow, false);
    } finally { f.cleanup(); }
  });

  test('a broken diff computation fails closed', () => {
    const f = fixture();
    try {
      const d = evaluateGate({ kind: 'pr-create', cwd: f.repo }, { plan: () => { throw new Error('base ref "origin/main" not found'); } });
      assert.equal(d.allow, false);
      assert.match(d.reason, /origin\/main/);
    } finally { f.cleanup(); }
  });

  test('outside a git checkout → not gated', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prsr-nogit-'));
    try {
      assert.deepEqual(evaluateGate({ kind: 'pr-create', cwd: dir }), { allow: true });
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('hook process (stdin → stdout)', () => {
  const runHook = (input, env = {}) => spawnSync('node', [HOOK], {
    input: JSON.stringify(input), encoding: 'utf8', env: { ...process.env, PR_SELF_REVIEW_GATE: '', ...env },
  });

  test('unrelated commands produce no output', () => {
    const r = runHook({ tool_name: 'Bash', tool_input: { command: 'ls -la' }, cwd: os.tmpdir() });
    assert.equal(r.status, 0);
    assert.equal(r.stdout, '');
  });

  test('gh pr create without a review → a PreToolUse deny decision', () => {
    // the real repo with the real map: whatever the working tree is, a fresh fake diff has no verdict
    const repo = path.resolve(HERE, '..', '..', '..', '..');
    const marker = path.join(repo, `.prsr-gate-probe-${process.pid}.tmp`);
    fs.writeFileSync(marker, String(Date.now()));
    try {
      const r = runHook({ tool_name: 'Bash', tool_input: { command: 'gh pr create --fill' }, cwd: repo });
      assert.equal(r.status, 0, r.stderr);
      const out = JSON.parse(r.stdout);
      assert.equal(out.hookSpecificOutput.permissionDecision, 'deny');
      assert.match(out.hookSpecificOutput.permissionDecisionReason, /pr-self-review/);
    } finally { fs.rmSync(marker, { force: true }); }
  });

  test('PR_SELF_REVIEW_GATE=off in the hook environment disables the gate', () => {
    const r = runHook({ tool_name: 'Bash', tool_input: { command: 'gh pr create' }, cwd: os.tmpdir() }, { PR_SELF_REVIEW_GATE: 'off' });
    assert.equal(r.stdout, '');
  });
});
