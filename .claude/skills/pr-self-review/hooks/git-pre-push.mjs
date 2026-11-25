#!/usr/bin/env node
// Level 2 (optional) — git `pre-push` hook for pushes from ANY tool on this machine.
// Installed only on request: node .claude/skills/pr-self-review/scripts/install-git-hook.mjs
//
// For every pushed branch that has an OPEN pull request (decision D4), the pushed COMMIT must
// have a PASS verdict: verdicts/<hash>.json where <hash> = diff of merge-base(commit, base)..commit
// (diffHashForCommit — equal to the working-tree hash of a clean checkout of that commit).
// It never runs the review itself (no LLM in a git hook): it tells you to run /pr-self-review.
// Branch deletes, tags and branches without an open PR are not checked.
// Bypass, as with any git hook: `git push --no-verify`, or PR_SELF_REVIEW_GATE=off.
// Exit 0 = push continues · 1 = push refused.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { diffHashForCommit } from '../scripts/collect.mjs';
import { verdictPath } from '../scripts/verdict.mjs';

const ZERO = /^0+$/;

/** Parse git's pre-push stdin: "<local ref> <local sha> <remote ref> <remote sha>" per line. */
export function parsePushLines(text) {
  return String(text ?? '').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
    const [localRef, localSha, remoteRef, remoteSha] = l.split(/\s+/);
    return { localRef, localSha, remoteRef, remoteSha };
  });
}

/** Is there an open PR whose head is `branch`? Unknown (no gh, no network) → false. */
export function openPrFor(repo, branch) {
  if (process.env.PR_SELF_REVIEW_ASSUME_OPEN_PR === '1') return true; // tightens only; used by tests
  try {
    const out = execFileSync('gh', ['pr', 'list', '--head', branch, '--state', 'open', '--json', 'number', '-q', 'length'], {
      cwd: repo, encoding: 'utf8', timeout: 15_000, stdio: ['ignore', 'pipe', 'ignore'],
    });
    return Number(out.trim()) > 0;
  } catch {
    return false;
  }
}

const readVerdictFile = (repo, hash) => {
  const p = verdictPath(repo, hash);
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
};

/**
 * Check every pushed ref. Returns a list of problems (empty = push may continue).
 * Deps are injectable for tests.
 */
export function checkPush({ repo, lines, base = process.env.PR_SELF_REVIEW_BASE || 'origin/main' }, deps = {}) {
  const { openPr = openPrFor, hashFor = diffHashForCommit, readVerdict = readVerdictFile } = deps;
  const problems = [];
  for (const l of lines) {
    if (!l.localSha || ZERO.test(l.localSha)) continue; // branch delete
    if (!l.remoteRef?.startsWith('refs/heads/')) continue; // tags etc.
    const branch = l.remoteRef.slice('refs/heads/'.length);
    if (!openPr(repo, branch)) continue;
    let hash;
    try {
      ({ diffHash: hash } = hashFor({ repo, base, commit: l.localSha }));
    } catch (e) {
      problems.push(`${branch}: cannot compute the diff of ${l.localSha.slice(0, 10)} against ${base} (${e.message})`);
      continue;
    }
    const v = readVerdict(repo, hash);
    const short = hash.slice(0, 16);
    if (!v) {
      problems.push(`${branch}: commit ${l.localSha.slice(0, 10)} (diff ${short}) has no pr-self-review verdict. Review exactly what you push: commit everything, then run /pr-self-review on the clean tree.`);
    } else if (v.verdict !== 'PASS') {
      const why = v.verdict === 'BLOCK'
        ? `${v.blocking.length} blocking CRITICAL finding(s): ${v.blocking.join(', ')}`
        : `the review is INCOMPLETE (${(v.incomplete ?? []).join('; ')})`;
      problems.push(`${branch}: commit ${l.localSha.slice(0, 10)} — ${why}. Report: ${verdictPath(repo, hash, 'md')}`);
    }
  }
  return problems;
}

async function readStdin() {
  let data = '';
  for await (const chunk of process.stdin) data += chunk;
  return data;
}

async function main() {
  if (process.env.PR_SELF_REVIEW_GATE === 'off') return 0;
  const repo = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  const lines = parsePushLines(await readStdin());
  let problems;
  try { problems = checkPush({ repo, lines }); } catch (e) {
    problems = [`pr-self-review pre-push check failed: ${e.message}`];
  }
  if (!problems.length) return 0;
  process.stderr.write(`\npr-self-review: push refused — the branch has an open PR and the pushed commit is not reviewed with PASS.\n${problems.map((p) => `  - ${p}`).join('\n')}\n(Bypass only if you must: git push --no-verify)\n\n`);
  return 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main();
}
