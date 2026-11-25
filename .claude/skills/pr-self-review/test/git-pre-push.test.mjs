// node --test '.claude/skills/pr-self-review/test/*.test.mjs'
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parsePushLines, checkPush } from '../hooks/git-pre-push.mjs';
import { run as installer, MARKER } from '../scripts/install-git-hook.mjs';
import { diffHashForCommit } from '../scripts/collect.mjs';
import { verdictPath } from '../scripts/verdict.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REAL_REPO = path.resolve(HERE, '..', '..', '..', '..');
const SHA = 'a'.repeat(40);
const ZERO = '0'.repeat(40);

function tmpRepo(prefix = 'prsr-push-') {
  const repo = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  const git = (...a) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  git('init', '--quiet', '--initial-branch=main');
  git('config', 'user.email', 'test@example.invalid'); git('config', 'user.name', 't'); git('config', 'commit.gpgsign', 'false');
  return { repo, git, cleanup: () => fs.rmSync(repo, { recursive: true, force: true }) };
}

describe('parsePushLines', () => {
  test('one object per ref line', () => {
    assert.deepEqual(parsePushLines(`refs/heads/f ${SHA} refs/heads/f ${ZERO}\n\n`), [
      { localRef: 'refs/heads/f', localSha: SHA, remoteRef: 'refs/heads/f', remoteSha: ZERO },
    ]);
  });
});

describe('checkPush', () => {
  const line = (over = {}) => ({ localRef: 'refs/heads/f', localSha: SHA, remoteRef: 'refs/heads/f', remoteSha: ZERO, ...over });
  const deps = (verdict, openPr = true) => ({
    openPr: () => openPr,
    hashFor: () => ({ diffHash: 'h'.repeat(64) }),
    readVerdict: () => verdict,
  });
  const check = (lines, d) => checkPush({ repo: '/r', lines }, d);

  test('no open PR, branch delete, tag → not checked', () => {
    assert.deepEqual(check([line()], deps(null, false)), []);
    assert.deepEqual(check([line({ localSha: ZERO })], deps(null)), []);
    assert.deepEqual(check([line({ remoteRef: 'refs/tags/v1' })], deps(null)), []);
  });
  test('open PR: no verdict / BLOCK / INCOMPLETE refuse, PASS allows', () => {
    assert.match(check([line()], deps(null))[0], /no pr-self-review verdict/);
    assert.match(check([line()], deps({ verdict: 'BLOCK', blocking: ['F-1'] }))[0], /1 blocking CRITICAL finding\(s\): F-1/);
    assert.match(check([line()], deps({ verdict: 'INCOMPLETE', incomplete: ['x'] }))[0], /INCOMPLETE \(x\)/);
    assert.deepEqual(check([line()], deps({ verdict: 'PASS' })), []);
  });
});

describe('install-git-hook', () => {
  test('install, status, update, uninstall', () => {
    const t = tmpRepo('prsr-inst-');
    try {
      assert.equal(installer(t.repo, 'status').status, 'absent');
      assert.equal(installer(t.repo).status, 'installed');
      const file = path.join(t.repo, '.git/hooks/pre-push');
      assert.ok(fs.readFileSync(file, 'utf8').includes(MARKER));
      assert.ok(fs.statSync(file).mode & 0o100, 'executable');
      assert.equal(installer(t.repo, 'status').status, 'installed');
      assert.equal(installer(t.repo).status, 'updated');
      assert.equal(installer(t.repo, 'uninstall').status, 'removed');
      assert.ok(!fs.existsSync(file));
    } finally { t.cleanup(); }
  });
  test('never touches a foreign hook or a hook manager', () => {
    const t = tmpRepo('prsr-inst-');
    try {
      const file = path.join(t.repo, '.git/hooks/pre-push');
      fs.writeFileSync(file, '#!/bin/sh\necho mine\n', { mode: 0o755 });
      assert.equal(installer(t.repo).status, 'foreign');
      assert.equal(installer(t.repo, 'uninstall').status, 'foreign');
      assert.equal(fs.readFileSync(file, 'utf8'), '#!/bin/sh\necho mine\n');
      fs.rmSync(file);
      t.git('config', 'core.hooksPath', '.husky');
      assert.equal(installer(t.repo).status, 'managed');
      assert.ok(!fs.existsSync(path.join(t.repo, '.husky/pre-push')));
    } finally { t.cleanup(); }
  });
});

describe('real git push through the installed hook', () => {
  test('refused without a PASS for the pushed commit, allowed with one; deletes pass', () => {
    const t = tmpRepo();
    const remote = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'prsr-remote-')));
    try {
      execFileSync('git', ['init', '--quiet', '--bare', remote]);
      // the hook runs the script from the pushed checkout, so the fixture carries the skill
      fs.cpSync(path.join(REAL_REPO, '.claude', 'skills'), path.join(t.repo, '.claude', 'skills'), { recursive: true });
      fs.writeFileSync(path.join(t.repo, '.gitignore'), '.devdigest/cache/\n');
      fs.mkdirSync(path.join(t.repo, 'server/src'), { recursive: true });
      fs.writeFileSync(path.join(t.repo, 'server/src/a.ts'), 'export const a = 1;\n');
      t.git('add', '-A'); t.git('commit', '--quiet', '-m', 'base');
      t.git('remote', 'add', 'origin', remote);
      t.git('push', '--quiet', 'origin', 'main'); // no hook yet
      t.git('checkout', '--quiet', '-b', 'feature');
      fs.writeFileSync(path.join(t.repo, 'server/src/a.ts'), 'export const a = 2;\n');
      t.git('commit', '--quiet', '-am', 'change');
      assert.equal(installer(t.repo).status, 'installed');

      const env = { ...process.env, PR_SELF_REVIEW_ASSUME_OPEN_PR: '1', PR_SELF_REVIEW_GATE: '' };
      const push = (...a) => spawnSync('git', ['-C', t.repo, 'push', ...a], { encoding: 'utf8', env });

      let r = push('origin', 'feature');
      assert.notEqual(r.status, 0, 'refused');
      assert.match(r.stderr, /push refused[\s\S]*no pr-self-review verdict/);

      // a PASS verdict for exactly the pushed commit (as a review on the clean tree would write)
      const head = t.git('rev-parse', 'HEAD').trim();
      const { diffHash } = diffHashForCommit({ repo: t.repo, commit: head });
      const file = verdictPath(t.repo, diffHash);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify({ verdict: 'PASS', diffHash, blocking: [], findings: [], incomplete: [] }));
      r = push('origin', 'feature');
      assert.equal(r.status, 0, r.stderr);

      // a new commit is not covered by the old verdict
      fs.writeFileSync(path.join(t.repo, 'server/src/a.ts'), 'export const a = 3;\n');
      t.git('commit', '--quiet', '-am', 'more');
      assert.notEqual(push('origin', 'feature').status, 0);

      // deleting the remote branch is never checked
      assert.equal(push('origin', '--delete', 'feature').status, 0);
    } finally {
      t.cleanup();
      fs.rmSync(remote, { recursive: true, force: true });
    }
  });
});
