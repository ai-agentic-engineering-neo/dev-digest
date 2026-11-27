// Git access: base resolution, change list, changed line ranges and the diff fingerprint.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { isProbablyBinary } from './util.mjs';

const MAX_BUFFER = 512 * 1024 * 1024;
// Pin everything user config could change in diff output, so the fingerprint is stable.
const DIFF_FLAGS = ['--no-color', '--no-ext-diff', '--no-textconv', '--src-prefix=a/', '--dst-prefix=b/'];

export function git(args, { cwd, allowFail = false, encoding = 'utf8', env } = {}) {
  try {
    return execFileSync('git', ['-c', 'core.quotePath=false', ...args], {
      cwd,
      encoding,
      env: env ? { ...process.env, ...env } : process.env,
      maxBuffer: MAX_BUFFER,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (e) {
    if (allowFail) return null;
    const err = e.stderr ? e.stderr.toString().trim() : e.message;
    throw new Error(`git ${args.join(' ')} failed: ${err}`);
  }
}

export function repoRoot(cwd = process.cwd()) {
  return git(['rev-parse', '--show-toplevel'], { cwd }).trim();
}

export function revParse(root, ref) {
  return git(['rev-parse', ref], { cwd: root }).trim();
}

/** merge-base of `ref` with origin/main (falls back to main, or PR_SELF_REVIEW_BASE). */
export function resolveBase(root, ref = 'HEAD') {
  const candidates = process.env.PR_SELF_REVIEW_BASE
    ? [process.env.PR_SELF_REVIEW_BASE]
    : ['origin/main', 'main'];
  for (const c of candidates) {
    if (!git(['rev-parse', '--verify', '--quiet', `${c}^{commit}`], { cwd: root, allowFail: true })) continue;
    const mb = git(['merge-base', c, ref], { cwd: root, allowFail: true });
    if (mb) return { baseRef: c, baseSha: mb.trim() };
  }
  throw new Error(`cannot resolve base branch (tried ${candidates.join(', ')}); set PR_SELF_REVIEW_BASE`);
}

export function untrackedFiles(root) {
  return git(['ls-files', '--others', '--exclude-standard', '-z'], { cwd: root })
    .split('\0')
    .filter(Boolean)
    .sort();
}

/**
 * Git tree of the working tree as `git add -A` would stage it (tracked + untracked,
 * .gitignore respected), built in a throwaway index so the real index is untouched.
 */
export function worktreeTree(root) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pr-self-review-index-'));
  const index = path.join(tmp, 'index');
  try {
    const real = path.resolve(root, git(['rev-parse', '--git-path', 'index'], { cwd: root }).trim());
    if (fs.existsSync(real)) fs.copyFileSync(real, index); // reuse stat cache → fast
    const env = { GIT_INDEX_FILE: index };
    git(['add', '-A', '--', '.'], { cwd: root, env });
    return git(['write-tree'], { cwd: root, env }).trim();
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

/**
 * Identity of "what a PR from this state would contain": sha256(merge-base, tree).
 *  - worktree mode (commit = null): the tree `git add -A` would produce now.
 *  - commit mode: the tree of <commit>.
 * Committing the reviewed changes unchanged yields the same tree, so a review of
 * the worktree stays valid after the commit; any content change invalidates it.
 */
export function fingerprint(root, { baseSha, commit = null }) {
  const tree = commit ? git(['rev-parse', `${commit}^{tree}`], { cwd: root }).trim() : worktreeTree(root);
  return createHash('sha256').update(`fp-v2\0${baseSha}\0${tree}`).digest('hex');
}

/** Parses `git diff -U0` output into { path: [[start, end], ...] } on the new side. */
export function parseChangedRanges(diffText) {
  const ranges = {};
  let current = null;
  let inHeader = false; // a content line "++ x" also renders as "+++ x" — only trust headers
  for (const line of diffText.split('\n')) {
    if (line.startsWith('diff --git ')) {
      inHeader = true;
      current = null;
      continue;
    }
    if (line.startsWith('@@')) inHeader = false;
    if (inHeader && line.startsWith('+++ ')) {
      const target = line.slice(4).replace(/\t$/, '');
      current = target === '/dev/null' ? null : target.replace(/^b\//, '');
      if (current && !ranges[current]) ranges[current] = [];
      continue;
    }
    if (!current || !line.startsWith('@@')) continue;
    const m = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (!m) continue;
    const start = Number(m[1]);
    const len = m[2] === undefined ? 1 : Number(m[2]);
    if (len > 0) ranges[current].push([start, start + len - 1]);
  }
  return ranges;
}

function parseNameStatus(out) {
  const tok = out.split('\0').filter((t) => t !== '');
  const entries = [];
  for (let i = 0; i < tok.length; ) {
    const status = tok[i++];
    if (status.startsWith('R') || status.startsWith('C')) {
      const oldPath = tok[i++];
      const p = tok[i++];
      entries.push({ path: p, old_path: oldPath, status: status[0] });
    } else {
      entries.push({ path: tok[i++], status: status[0] });
    }
  }
  return entries;
}

/** All changes base → worktree (committed + staged + unstaged + untracked). */
export function listChanges(root, baseSha) {
  const entries = parseNameStatus(git(['diff', '--name-status', '-z', '-M', ...DIFF_FLAGS, baseSha], { cwd: root }));
  const ranges = parseChangedRanges(git(['diff', '-U0', '-M', ...DIFF_FLAGS, baseSha], { cwd: root }));
  const files = entries.map((e) => {
    const abs = path.join(root, e.path);
    const deleted = e.status === 'D';
    const binary = !deleted && isProbablyBinary(abs);
    const r = deleted || binary ? [] : ranges[e.path] ?? [];
    return { ...e, untracked: false, deleted, binary, ranges: r, changed_lines: countLines(r) };
  });
  for (const p of untrackedFiles(root)) {
    const abs = path.join(root, p);
    let st;
    try {
      st = fs.lstatSync(abs);
    } catch {
      continue;
    }
    if (!st.isFile()) continue;
    const binary = isProbablyBinary(abs);
    let r = [];
    if (!binary) {
      const text = fs.readFileSync(abs, 'utf8');
      const n = text.length === 0 ? 0 : text.replace(/\n$/, '').split('\n').length;
      r = n > 0 ? [[1, n]] : [];
    }
    files.push({ path: p, status: 'A', untracked: true, deleted: false, binary, ranges: r, changed_lines: countLines(r) });
  }
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

export function countLines(ranges) {
  return ranges.reduce((n, [s, e]) => n + (e - s + 1), 0);
}

/** Unified diff (3 lines of context) of one tracked file, base → worktree. */
export function fileDiff(root, baseSha, file) {
  return git(['diff', '-U3', '-M', ...DIFF_FLAGS, baseSha, '--', file], { cwd: root }) ?? '';
}

export function originRepo(root) {
  const url = git(['remote', 'get-url', 'origin'], { cwd: root, allowFail: true })?.trim();
  if (!url) return null;
  const m = /github\.com[:/]([^/]+)\/(.+?)(?:\.git)?\/?$/.exec(url);
  return m ? { owner: m[1], repo: m[2] } : null;
}
