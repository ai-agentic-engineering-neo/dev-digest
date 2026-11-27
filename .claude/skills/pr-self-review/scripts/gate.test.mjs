// End-to-end test of the PreToolUse gate against a throwaway git repo.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { fingerprint, listChanges, resolveBase } from './lib/git.mjs';
import { statePaths, writeJson } from './lib/util.mjs';

const GATE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'gate.mjs');
let repo;
const sh = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const write = (f, text) => {
  fs.mkdirSync(path.dirname(path.join(repo, f)), { recursive: true });
  fs.writeFileSync(path.join(repo, f), text);
};
const gate = (command, mode = 'pre') =>
  spawnSync('node', [GATE, mode], {
    input: JSON.stringify({ tool_name: 'Bash', tool_input: { command }, cwd: repo }),
    encoding: 'utf8',
    env: { ...process.env, PR_SELF_REVIEW_BASE: '' },
  });
const commitFp = () => {
  const { baseSha } = resolveBase(repo);
  return fingerprint(repo, { baseSha, commit: sh('rev-parse', 'HEAD').trim() });
};
const storeResult = (fp, verdict, extra = {}) =>
  writeJson(path.join(statePaths(repo).results, `${fp}.json`), { verdict, blocking: verdict === 'fail' ? ['F001'] : [], incomplete: [], ...extra });

before(() => {
  repo = fs.mkdtempSync(path.join(os.tmpdir(), 'pr-self-review-'));
  sh('init', '-q', '-b', 'main');
  sh('config', 'user.email', 'test@example.com');
  sh('config', 'user.name', 'test');
  sh('config', 'commit.gpgsign', 'false');
  write('.gitignore', '.devdigest/self-review/\n');
  write('src/a.ts', 'export const a = 1;\n');
  sh('add', '-A');
  sh('commit', '-qm', 'base');
  sh('checkout', '-qb', 'feature');
  write('src/a.ts', 'export const a = 2;\n');
  sh('commit', '-qam', 'change');
});
after(() => fs.rmSync(repo, { recursive: true, force: true }));

test('unrelated commands pass through, including quoted mentions', () => {
  assert.equal(gate('ls -la').status, 0);
  assert.equal(gate('gh pr view 12').status, 0);
  assert.equal(gate(`echo "run gh pr create later"`).status, 0);
  assert.equal(gate(`for c in 'ls' 'gh pr create --fill'; do echo $c; done`).status, 0);
});

test('gh pr in command position is caught after && ; | and env prefixes', () => {
  for (const c of ['gh pr create', 'cd x && gh pr create', 'true; gh pr merge 1', 'GH_HOST=x gh pr ready 2', 'if a; then gh pr create; fi']) {
    assert.equal(gate(c).status, 2, c);
  }
});

test('gh pr create without a review is blocked', () => {
  const r = gate('cd x && gh pr create --fill');
  assert.equal(r.status, 2);
  assert.match(r.stderr, /Run \/pr-self-review/);
});

test('clean worktree: worktree fingerprint equals commit fingerprint', () => {
  const { baseSha } = resolveBase(repo);
  assert.equal(fingerprint(repo, { baseSha }), commitFp());
});

test('fail verdict blocks create and merge; pass allows; override passes with a note', () => {
  const fp = commitFp();
  storeResult(fp, 'fail');
  assert.equal(gate('gh pr create').status, 2);
  assert.match(gate('gh pr merge 3 --squash').stderr, /FAIL/);
  storeResult(fp, 'pass');
  assert.equal(gate('gh pr create').status, 0);
  storeResult(fp, 'pass', { override: { reason: 'hotfix, follow-up #9', critical_count: 1 } });
  const r = gate('gh pr ready');
  assert.equal(r.status, 0);
  assert.match(r.stderr, /override/);
});

test('a new commit with a code change invalidates the review', () => {
  storeResult(commitFp(), 'pass');
  write('src/a.ts', 'export const a = 3;\n');
  sh('commit', '-qam', 'more');
  assert.equal(gate('gh pr create').status, 2);
});

test('reviewing a dirty tree counts once the same changes are committed', () => {
  write('src/b.ts', 'export const b = 1;\n'); // untracked
  const { baseSha } = resolveBase(repo);
  const worktreeFp = fingerprint(repo, { baseSha });
  storeResult(worktreeFp, 'pass');
  const blocked = gate('gh pr create');
  assert.equal(blocked.status, 2);
  assert.match(blocked.stderr, /uncommitted/);
  sh('add', '-A');
  sh('commit', '-qm', 'add b');
  assert.equal(gate('gh pr create').status, 0);
});

test('listChanges sees committed, unstaged and untracked changes with line ranges', () => {
  write('src/a.ts', 'export const a = 3;\nexport const z = 0;\n'); // unstaged
  write('src/c.ts', 'one\ntwo\n'); // untracked
  const { baseSha } = resolveBase(repo);
  const files = Object.fromEntries(listChanges(repo, baseSha).map((f) => [f.path, f]));
  assert.deepEqual(files['src/a.ts'].ranges, [[1, 2]]);
  assert.deepEqual(files['src/b.ts'].ranges, [[1, 1]]);
  assert.equal(files['src/c.ts'].untracked, true);
  assert.deepEqual(files['src/c.ts'].ranges, [[1, 2]]);
});

test('post mode never fails and ignores non-push commands', () => {
  assert.equal(gate('echo hi', 'post').status, 0);
  const r = gate('git push origin feature', 'post'); // no origin remote → reports, exit 0
  assert.equal(r.status, 0);
  assert.match(r.stdout, /additionalContext/);
});
