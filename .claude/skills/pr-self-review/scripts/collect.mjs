#!/usr/bin/env node
// pr-self-review — step 1: collect the diff scope and map changed files to review skills.
// Deterministic, no dependencies. Judgment (what is a finding) lives in SKILL.md and the prompts.
//
// Scope = everything not yet on the base branch: commits since merge-base(HEAD, base)
// + staged + unstaged changes (one `git diff <merge-base>` against the working tree)
// + untracked, non-ignored files.
//
// Exit codes: 0 ok (incl. empty diff) · 1 git/usage error · 2 skill-map completeness error.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = path.resolve(HERE, '..');
export const DEFAULT_MAP = path.join(SKILL_DIR, 'skill-map.json');
export const PACKAGES = ['client', 'server', 'reviewer-core', 'e2e'];

/** All run artifacts live under <repo>/.devdigest/cache/pr-self-review (git-ignored). */
export const cacheDir = (repo) => path.join(repo, '.devdigest', 'cache', 'pr-self-review');
/** One directory per reviewed diff: plan.json, checks.json, units/, verify/. */
export const runDir = (repo, diffHash) => path.join(cacheDir(repo), 'runs', diffHash.slice(0, 16));

const MAX_DIFF_CHARS = 200_000; // per file; larger diffs are truncated and flagged
const MAX_UNTRACKED_BYTES = 1_000_000;

// ---------- globs ----------

/** Glob → RegExp. Supports `**`, `*`, `?`, `{a,b}` (non-nested). Paths use forward slashes. */
export function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        i++;
        if (glob[i + 1] === '/') { i++; re += '(?:.*/)?'; } else re += '.*';
      } else re += '[^/]*';
    } else if (c === '?') re += '[^/]';
    else if (c === '{') {
      const end = glob.indexOf('}', i);
      if (end === -1) { re += '\\{'; continue; }
      const alts = glob.slice(i + 1, end).split(',').map((a) => globToRegExp(a).source.slice(1, -1));
      re += `(?:${alts.join('|')})`;
      i = end;
    } else re += c.replace(/[.+^$()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}

const globCache = new Map();
export function matchesAny(file, globs = []) {
  return globs.some((g) => {
    if (!globCache.has(g)) globCache.set(g, globToRegExp(g));
    return globCache.get(g).test(file);
  });
}

// ---------- skill map ----------

export function loadMap(mapPath = DEFAULT_MAP) {
  return JSON.parse(fs.readFileSync(mapPath, 'utf8'));
}

/**
 * Every skill directory must be mapped or explicitly excluded; every mapped skill and its
 * references must exist. Returns a list of problems (empty = ok).
 */
export function checkCompleteness(map, skillsDir) {
  const problems = [];
  const present = fs.readdirSync(skillsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(skillsDir, d.name, 'SKILL.md')))
    .map((d) => d.name);
  const mapped = Object.keys(map.skills || {});
  const excluded = Object.keys(map.excluded || {});
  for (const name of present) {
    if (!mapped.includes(name) && !excluded.includes(name)) {
      problems.push(`skill "${name}" is neither in skills nor in excluded of skill-map.json — decide which files it reviews`);
    }
  }
  for (const name of [...mapped, ...excluded]) {
    if (!present.includes(name)) problems.push(`skill-map.json lists "${name}" but .claude/skills/${name}/SKILL.md does not exist`);
  }
  for (const name of mapped.filter((n) => excluded.includes(n))) {
    problems.push(`skill "${name}" is both mapped and excluded`);
  }
  for (const [name, s] of Object.entries(map.skills || {})) {
    if (!Array.isArray(s.paths) || s.paths.length === 0) problems.push(`skill "${name}" has no paths`);
    for (const ref of s.references || []) {
      if (!fs.existsSync(path.join(skillsDir, name, ref))) problems.push(`skill "${name}" reference ${ref} does not exist`);
    }
    for (const p of s.triggers?.patterns || []) {
      try { new RegExp(p, 'm'); } catch (e) { problems.push(`skill "${name}" trigger /${p}/ is invalid: ${e.message}`); }
    }
  }
  return problems;
}

/** Skills that should review `file`, given the text of its added lines. Sorted by priority. */
export function matchSkills(file, addedText, map) {
  if (matchesAny(file, map.ignore)) return [];
  const hits = [];
  for (const [name, s] of Object.entries(map.skills || {})) {
    if (matchesAny(file, s.exclude)) continue;
    let reason = null;
    if (matchesAny(file, s.paths)) reason = 'path';
    else if (s.triggers && matchesAny(file, s.triggers.scope)) {
      const p = (s.triggers.patterns || []).find((pat) => new RegExp(pat, 'm').test(addedText));
      if (p) reason = `content /${p}/`;
    }
    if (reason) hits.push({ name, priority: s.priority ?? 99, reason });
  }
  return hits.sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name));
}

export function packageOf(file) {
  const top = file.split('/')[0];
  return PACKAGES.includes(top) ? top : 'root';
}

/** Added lines of a unified diff, without the leading '+'. */
export function addedLines(diff) {
  return diff.split('\n')
    .filter((l) => l.startsWith('+') && !l.startsWith('+++'))
    .map((l) => l.slice(1))
    .join('\n');
}

/** Added lines of a unified diff with their line numbers in the new file. */
export function parseAddedLines(diff) {
  const out = [];
  let line = 0;
  for (const l of diff.split('\n')) {
    const h = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(l);
    if (h) { line = Number(h[1]); continue; }
    if (line === 0) continue; // file headers before the first hunk
    if (l.startsWith('+')) out.push({ line: line++, text: l.slice(1) });
    else if (l.startsWith('-')) continue;
    else if (l.startsWith('\\')) continue; // "\ No newline at end of file"
    else line++;
  }
  return out;
}

// ---------- git ----------

function git(repo, args, opts = {}) {
  return execFileSync('git', ['-C', repo, ...args], {
    encoding: opts.encoding ?? 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    stdio: ['ignore', 'pipe', opts.quiet ? 'ignore' : 'pipe'],
  });
}

function tryGit(repo, args) {
  try { return git(repo, args, { quiet: true }).trim(); } catch { return null; }
}

/** Parse `git diff -z --name-status -M` output. */
export function parseNameStatus(out) {
  const parts = out.split('\0').filter((p) => p !== '');
  const files = [];
  for (let i = 0; i < parts.length;) {
    const code = parts[i++];
    const status = code[0];
    if (status === 'R' || status === 'C') {
      files.push({ status, similarity: Number(code.slice(1)) || null, oldPath: parts[i++], path: parts[i++] });
    } else files.push({ status, path: parts[i++] });
  }
  return files;
}

/** Parse `git diff -z --numstat -M` output → Map(path → {additions, deletions, binary}). */
export function parseNumstat(out) {
  const res = new Map();
  const parts = out.split('\0');
  for (let i = 0; i < parts.length; i++) {
    const head = parts[i];
    if (!head) continue;
    const [a, d, p] = head.split('\t');
    let file = p;
    if (p === '') { i += 2; file = parts[i]; } // rename: "a\td\t\0old\0new"
    const binary = a === '-' && d === '-';
    res.set(file, { additions: binary ? 0 : Number(a), deletions: binary ? 0 : Number(d), binary });
  }
  return res;
}

function isBinaryBuffer(buf) {
  return buf.subarray(0, 8000).includes(0);
}

function resolveBase(repo, base, fetch) {
  if (fetch && base.startsWith('origin/')) {
    tryGit(repo, ['fetch', '--quiet', 'origin', base.slice('origin/'.length)]);
  }
  for (const candidate of [base, base.replace(/^origin\//, '')]) {
    const sha = tryGit(repo, ['rev-parse', '--verify', '--quiet', `${candidate}^{commit}`]);
    if (sha) return { ref: candidate, sha };
  }
  throw new Error(`base ref "${base}" not found (try --base <ref>)`);
}

// ---------- collect ----------

/**
 * Diff hash of a COMMIT (merge-base(commit, base)..commit), without the working tree.
 * Same formula as collect(): for a clean checkout of that commit both return the same hash,
 * so a verdict made on a clean tree is found by the git pre-push hook for the pushed commit.
 */
export function diffHashForCommit({ repo, base = 'origin/main', commit, fetch = false }) {
  const baseInfo = resolveBase(repo, base, fetch);
  const mergeBase = git(repo, ['merge-base', commit, baseInfo.sha]).trim();
  const hash = crypto.createHash('sha256');
  hash.update(`merge-base ${mergeBase}\n`);
  hash.update(git(repo, ['diff', '--binary', '--no-color', '--no-ext-diff', '-M', mergeBase, commit], { encoding: 'buffer' }));
  return { diffHash: hash.digest('hex'), mergeBase, base: baseInfo };
}

export function collect({ repo, base = 'origin/main', fetch = true, map, skillsDir }) {
  repo = git(repo, ['rev-parse', '--show-toplevel']).trim();
  skillsDir ??= path.join(repo, '.claude', 'skills');
  const problems = checkCompleteness(map, skillsDir);
  if (problems.length) {
    const err = new Error(`skill-map.json is incomplete:\n- ${problems.join('\n- ')}`);
    err.code = 'INCOMPLETE_MAP';
    throw err;
  }

  const head = tryGit(repo, ['rev-parse', 'HEAD']);
  const branch = tryGit(repo, ['rev-parse', '--abbrev-ref', 'HEAD']);
  const baseInfo = resolveBase(repo, base, fetch);
  const mergeBase = git(repo, ['merge-base', 'HEAD', baseInfo.sha]).trim();

  const tracked = parseNameStatus(git(repo, ['diff', '-z', '--name-status', '-M', mergeBase]));
  const numstat = parseNumstat(git(repo, ['diff', '-z', '--numstat', '-M', mergeBase]));
  const untracked = git(repo, ['ls-files', '-z', '--others', '--exclude-standard'])
    .split('\0').filter(Boolean);

  const hash = crypto.createHash('sha256');
  hash.update(`merge-base ${mergeBase}\n`);
  hash.update(git(repo, ['diff', '--binary', '--no-color', '--no-ext-diff', '-M', mergeBase], { encoding: 'buffer' }));

  const files = [];
  for (const t of tracked) {
    const stat = numstat.get(t.path) ?? { additions: 0, deletions: 0, binary: false };
    const deleted = t.status === 'D';
    let diff = '';
    if (!stat.binary) {
      const paths = t.oldPath ? [t.oldPath, t.path] : [t.path];
      diff = git(repo, ['diff', '--no-color', '--no-ext-diff', '-M', mergeBase, '--', ...paths]);
    }
    files.push(buildFile(t.path, {
      status: t.status, oldPath: t.oldPath, ...stat, deleted, diff, map,
    }));
  }
  for (const p of untracked.sort()) {
    const abs = path.join(repo, p);
    let buf;
    try { buf = fs.readFileSync(abs); } catch { continue; } // e.g. a broken symlink
    hash.update(`untracked ${p}\0`);
    hash.update(crypto.createHash('sha256').update(buf).digest());
    const binary = isBinaryBuffer(buf);
    const tooBig = buf.length > MAX_UNTRACKED_BYTES;
    const text = binary || tooBig ? '' : buf.toString('utf8');
    const lines = text === '' ? [] : text.replace(/\n$/, '').split('\n');
    const diff = lines.length
      ? `--- /dev/null\n+++ b/${p}\n@@ -0,0 +1,${lines.length} @@\n${lines.map((l) => `+${l}`).join('\n')}\n`
      : '';
    files.push(buildFile(p, {
      status: 'untracked', additions: lines.length, deletions: 0, binary, deleted: false, diff, map,
      truncated: tooBig,
    }));
  }
  files.sort((a, b) => a.path.localeCompare(b.path));

  const units = {};
  for (const f of files) {
    for (const s of f.skills) (units[s] ??= []).push(f.path);
  }
  const orderedUnits = Object.entries(units)
    .map(([skill, list]) => ({
      skill,
      side: map.skills[skill].side,
      priority: map.skills[skill].priority ?? 99,
      maxSeverity: map.skills[skill].maxSeverity ?? 'CRITICAL',
      references: (map.skills[skill].references || []).map((r) => `.claude/skills/${skill}/${r}`),
      skillFile: `.claude/skills/${skill}/SKILL.md`,
      files: list,
    }))
    .sort((a, b) => a.priority - b.priority || a.skill.localeCompare(b.skill));

  return {
    version: 1,
    createdAt: new Date().toISOString(),
    repo,
    branch,
    head,
    base: { ref: baseInfo.ref, sha: baseInfo.sha },
    mergeBase,
    diffHash: hash.digest('hex'),
    empty: files.length === 0,
    packages: [...new Set(files.map((f) => f.package))].sort(),
    summary: {
      files: files.length,
      reviewable: files.filter((f) => f.reviewable).length,
      additions: files.reduce((n, f) => n + f.additions, 0),
      deletions: files.reduce((n, f) => n + f.deletions, 0),
      unmapped: files.filter((f) => f.reviewable && f.skills.length === 0).map((f) => f.path),
    },
    units: orderedUnits,
    files,
  };
}

function buildFile(p, { status, oldPath, additions, deletions, binary, deleted, diff, map, truncated = false }) {
  const ignored = matchesAny(p, map.ignore);
  const reviewable = !deleted && !binary && !ignored;
  const matched = reviewable ? matchSkills(p, addedLines(diff), map) : [];
  if (diff.length > MAX_DIFF_CHARS) { diff = diff.slice(0, MAX_DIFF_CHARS); truncated = true; }
  return {
    path: p,
    ...(oldPath ? { oldPath } : {}),
    status,
    package: packageOf(p),
    additions,
    deletions,
    binary,
    ignored,
    reviewable,
    truncated,
    skills: matched.map((m) => m.name),
    matchReasons: Object.fromEntries(matched.map((m) => [m.name, m.reason])),
    diff,
  };
}

// ---------- CLI ----------

function usage() {
  return `Usage: node collect.mjs [options]
  --base <ref>        base branch (default origin/main; falls back to the local branch)
  --no-fetch          do not run git fetch for an origin/* base
  --repo <dir>        repository (default: current directory)
  --map <file>        skill map (default: ../skill-map.json)
  --skills-dir <dir>  skills directory for the completeness check (default: <repo>/.claude/skills)
  --out <file>        write plan JSON here (default: <run dir>/plan.json, see runDir())
  --stdout            print the full plan JSON instead of writing a file (default: write it, print a summary)`;
}

function parseArgs(argv) {
  const o = { base: 'origin/main', fetch: true, repo: process.cwd(), map: DEFAULT_MAP };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => { if (i + 1 >= argv.length) throw new Error(`${a} needs a value`); return argv[++i]; };
    if (a === '--base') o.base = next();
    else if (a === '--no-fetch') o.fetch = false;
    else if (a === '--repo') o.repo = next();
    else if (a === '--map') o.map = next();
    else if (a === '--skills-dir') o.skillsDir = next();
    else if (a === '--out') o.out = next();
    else if (a === '--stdout') o.stdout = true;
    else if (a === '-h' || a === '--help') o.help = true;
    else throw new Error(`unknown argument ${a}`);
  }
  return o;
}

export function formatSummary(plan, outPath) {
  const lines = [];
  lines.push(`pr-self-review collect · ${plan.branch} vs ${plan.base.ref} (merge-base ${plan.mergeBase.slice(0, 8)})`);
  lines.push(`diff hash ${plan.diffHash.slice(0, 16)} · ${plan.summary.files} files (+${plan.summary.additions} −${plan.summary.deletions}), ${plan.summary.reviewable} reviewable · packages: ${plan.packages.join(', ') || '—'}`);
  if (plan.empty) { lines.push('Nothing to review: no changes against the base.'); return lines.join('\n'); }
  lines.push('Review units (skill → files):');
  for (const u of plan.units) lines.push(`  [${u.priority}] ${u.skill} (${u.side}) → ${u.files.length} file(s)`);
  const unmapped = plan.summary.unmapped;
  if (unmapped.length) {
    const shown = unmapped.slice(0, 10).join(', ');
    lines.push(`No skill matched, deterministic checks only (${unmapped.length}): ${shown}${unmapped.length > 10 ? ', …' : ''}`);
  }
  const other = plan.files.filter((f) => !f.reviewable).map((f) => `${f.path} (${f.deleted ? 'deleted' : f.binary ? 'binary' : 'ignored'})`);
  if (other.length) lines.push(`Not reviewed: ${other.join(', ')}`);
  if (outPath) lines.push(`Plan written to ${outPath}`);
  return lines.join('\n');
}

async function main() {
  let o;
  try { o = parseArgs(process.argv.slice(2)); } catch (e) { console.error(`${e.message}\n${usage()}`); process.exit(1); }
  if (o.help) { console.log(usage()); return; }
  let plan;
  try {
    plan = collect({ repo: o.repo, base: o.base, fetch: o.fetch, map: loadMap(o.map), skillsDir: o.skillsDir });
  } catch (e) {
    console.error(`pr-self-review collect: ${e.message}`);
    process.exit(e.code === 'INCOMPLETE_MAP' ? 2 : 1);
  }
  if (o.stdout) { process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`); return; }
  const out = path.resolve(o.out ?? path.join(runDir(plan.repo, plan.diffHash), 'plan.json'));
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `${JSON.stringify(plan, null, 2)}\n`);
  console.log(formatSummary(plan, out));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
