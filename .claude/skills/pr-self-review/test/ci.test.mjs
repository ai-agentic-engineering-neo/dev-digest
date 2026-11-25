// node --test '.claude/skills/pr-self-review/test/*.test.mjs'
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { annotation } from '../scripts/ci.mjs';
import { packagesToGate } from '../scripts/checks.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CI = path.resolve(HERE, '..', 'scripts', 'ci.mjs');
const REPO = path.resolve(HERE, '..', '..', '..', '..');

describe('annotation', () => {
  test('severity → level, file/line props, escaped message', () => {
    assert.equal(
      annotation({ severity: 'CRITICAL', rule: 'repo/secret', file: 'a,b.ts', line: 3, title: 'key: x\nnext', fix: '100%' }),
      '::error file=a%2Cb.ts,line=3,title=CRITICAL repo/secret::key: x%0Anext%0AFix: 100%25',
    );
    assert.match(annotation({ severity: 'WARNING', rule: 'r', title: 't' }), /^::warning title=WARNING r::t$/);
  });
});

describe('suite selection mirrors the CI path filters', () => {
  const p = (...paths) => packagesToGate({ files: paths.map((x) => ({ path: x })) });
  test('vendored contracts run client, server and reviewer-core', () => {
    assert.deepEqual(p('server/src/vendor/shared/contracts/findings.ts'), ['client', 'server', 'reviewer-core']);
  });
  test('a workflow file runs its own suite', () => {
    assert.deepEqual(p('.github/workflows/client.yml'), ['client']);
    assert.deepEqual(p('.github/workflows/server-unit.yml'), ['server']);
  });
  test('the contract-check script runs the client suite', () => {
    assert.deepEqual(p('scripts/check-contracts.sh'), ['client']);
  });
  test('reviewer-core package.json runs server too (server type-checks its sources)', () => {
    assert.deepEqual(p('reviewer-core/package.json'), ['server', 'reviewer-core']);
  });
});

describe('ci.mjs process', () => {
  test('writes suite outputs + summary and fails on a CRITICAL rule', () => {
    const repo = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'prsr-ci-')));
    const git = (...a) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    try {
      git('init', '--quiet', '--initial-branch=main');
      git('config', 'user.email', 'test@example.invalid'); git('config', 'user.name', 't'); git('config', 'commit.gpgsign', 'false');
      // the completeness check needs the real skills next to the repo's skill map
      fs.cpSync(path.join(REPO, '.claude', 'skills'), path.join(repo, '.claude', 'skills'), { recursive: true });
      fs.mkdirSync(path.join(repo, 'client/src'), { recursive: true });
      fs.writeFileSync(path.join(repo, 'client/src/a.ts'), 'export const a = 1;\n');
      git('add', '-A'); git('commit', '--quiet', '-m', 'base'); git('checkout', '--quiet', '-b', 'pr');
      fs.writeFileSync(path.join(repo, 'client/package-lock.json'), '{}\n'); // npm lockfile in a pnpm package
      fs.writeFileSync(path.join(repo, 'client/src/a.ts'), 'export const a = 2;\n');
      git('add', '-A'); git('commit', '--quiet', '-m', 'change');

      const out = path.join(repo, 'gh-output'); const sum = path.join(repo, 'gh-summary');
      const r = spawnSync('node', [CI, '--base', 'main', '--repo', repo], {
        encoding: 'utf8', env: { ...process.env, GITHUB_OUTPUT: out, GITHUB_STEP_SUMMARY: sum },
      });
      assert.equal(r.status, 1, r.stdout + r.stderr);
      assert.match(r.stdout, /::error file=client\/package-lock\.json/);
      const outputs = fs.readFileSync(out, 'utf8');
      assert.match(outputs, /^client=true$/m);
      assert.match(outputs, /^server=false$/m);
      assert.match(fs.readFileSync(sum, 'utf8'), /\*\*FAIL\*\* · CRITICAL 1/);
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });
});
