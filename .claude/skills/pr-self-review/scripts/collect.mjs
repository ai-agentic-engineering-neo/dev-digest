#!/usr/bin/env node
// Step 1 — collect every change the PR would contain and write run/manifest.json.
//   node collect.mjs [--no-fetch]
import fs from 'node:fs';
import { fingerprint, git, listChanges, repoRoot, resolveBase, revParse } from './lib/git.mjs';
import { statePaths, writeJson } from './lib/util.mjs';

const root = repoRoot();
const P = statePaths(root);

if (!process.argv.includes('--no-fetch')) {
  // Best effort: keeps origin/main current so the merge-base matches what GitHub will diff against.
  git(['fetch', '--quiet', 'origin', 'main'], { cwd: root, allowFail: true });
}

const { baseRef, baseSha } = resolveBase(root);
const head = revParse(root, 'HEAD');
const branch = git(['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: root }).trim();
const files = listChanges(root, baseSha);
const fp = fingerprint(root, { baseSha });
const commitFp = fingerprint(root, { baseSha, commit: head });
const uncommitted = git(['status', '--porcelain', '--untracked-files=all'], { cwd: root })
  .split('\n')
  .filter(Boolean);

fs.rmSync(P.run, { recursive: true, force: true });
writeJson(P.manifest, {
  version: 1,
  created_at: new Date().toISOString(),
  branch,
  head_sha: head,
  base_ref: baseRef,
  base_sha: baseSha,
  fingerprint: fp,
  commit_fingerprint: commitFp,
  dirty: fp !== commitFp,
  files,
});

const changed = files.reduce((n, f) => n + f.changed_lines, 0);
console.log(`branch ${branch} @ ${head.slice(0, 7)} · base ${baseRef} @ ${baseSha.slice(0, 7)}`);
console.log(`${files.length} changed file(s), ${changed} changed line(s) · fingerprint ${fp.slice(0, 12)}`);
if (fp !== commitFp) {
  console.log(`\n⚠ ${uncommitted.length} uncommitted/untracked path(s). The review covers them, but the PR will`);
  console.log('  contain only committed work, and the gate accepts this review only once the committed state');
  console.log('  matches what was reviewed (commit everything that belongs in the PR; delete or .gitignore the rest).');
  for (const l of uncommitted.slice(0, 20)) console.log(`    ${l}`);
  if (uncommitted.length > 20) console.log(`    … ${uncommitted.length - 20} more`);
}
console.log(`\nmanifest → ${P.manifest}`);
