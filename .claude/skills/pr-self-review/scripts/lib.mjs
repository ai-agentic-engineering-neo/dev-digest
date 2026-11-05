// Shared helpers for pr-self-review scripts. Node ≥ 22, no dependencies (runs before `pnpm install`).
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SKILL_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
export const SKILL_NAME = 'pr-self-review';

/** Repo root. Overridable for evals (`PR_SELF_REVIEW_ROOT`). */
export const ROOT =
  process.env.PR_SELF_REVIEW_ROOT ||
  execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: SKILL_DIR, encoding: 'utf8' }).trim();

export const STATE_DIR = join(ROOT, '.claude', 'pr-self-review');
export const RUN_DIR = join(STATE_DIR, 'run');
export const CACHE_DIR = join(STATE_DIR, 'cache');
export const WAIVERS_FILE = join(STATE_DIR, 'waivers.json');
export const LAST_RUN_FILE = join(STATE_DIR, 'last-run.json');
export const SUMMARY_FILE = join(STATE_DIR, 'pr-summary.md');
export const DEFAULT_BASE = process.env.PR_SELF_REVIEW_BASE || 'origin/main';

/** Packages from AGENTS.md. */
export const PACKAGES = ['client', 'server', 'reviewer-core', 'e2e'];

export const SEVERITIES = ['critical', 'high', 'medium', 'low'];
export const sevRank = (s) => {
  const i = SEVERITIES.indexOf(s);
  return i < 0 ? SEVERITIES.length : i;
};

export function git(args, opts = {}) {
  return execFileSync('git', args, {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
    ...opts,
  });
}

export const sha256 = (...parts) => {
  const h = createHash('sha256');
  for (const p of parts) h.update(typeof p === 'string' || Buffer.isBuffer(p) ? p : JSON.stringify(p));
  return h.digest('hex');
};

export const readJson = (file, fallback) => {
  if (!existsSync(file)) return fallback;
  return JSON.parse(readFileSync(file, 'utf8'));
};

export const writeJson = (file, data) => {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
};

export const readText = (file) => (existsSync(file) ? readFileSync(file, 'utf8') : '');

export const toPosix = (p) => p.replace(/\\/g, '/');

export function argValue(args, name, fallback) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}

// ---------------------------------------------------------------------------------------------
// Base / diff
// ---------------------------------------------------------------------------------------------

/** merge-base of `baseRef` and HEAD; falls back to the root commit of HEAD if `baseRef` is unknown. */
export function mergeBase(baseRef = DEFAULT_BASE) {
  try {
    return git(['merge-base', baseRef, 'HEAD']).trim();
  } catch {
    throw new Error(`cannot compute merge-base with "${baseRef}" — run \`git fetch origin\` or pass --base <ref>`);
  }
}

/** Untracked, not-ignored files (posix paths). The skill's own runtime dir is gitignored. */
export function untrackedFiles() {
  return git(['ls-files', '--others', '--exclude-standard', '-z'])
    .split('\0')
    .filter(Boolean)
    .map(toPosix);
}

/**
 * Stable fingerprint of "everything that would go into the PR" (commits + staged + unstaged +
 * untracked) vs the merge-base. Committing does NOT change it; editing does.
 *
 * Computed in a THROWAWAY index (copy of the real one + `git add -A`), then `git diff --cached`:
 * an untracked file is hashed exactly as it will look once committed (same blob, same EOL
 * normalization). Hashing untracked files raw next to `git diff` made the hash change on the commit
 * that added them, so the gate called a fresh PASS "stale". The real index is never touched.
 */
export function computeDiffHash(mb) {
  const tmpDir = mkdtempSync(join(tmpdir(), 'pr-self-review-'));
  const tmpIndex = join(tmpDir, 'index');
  try {
    const realIndex = resolve(ROOT, git(['rev-parse', '--git-path', 'index']).trim());
    if (existsSync(realIndex)) copyFileSync(realIndex, tmpIndex);
    const env = { ...process.env, GIT_INDEX_FILE: tmpIndex };
    git(['add', '-A', '--', '.'], { env });
    return sha256(git(['diff', '--cached', '--binary', '--no-color', '--no-ext-diff', mb], { env }));
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------------------------
// Glob
// ---------------------------------------------------------------------------------------------

const globCache = new Map();

/** Minimal glob → RegExp: `**`, `*`, `?`, `{a,b}`. Paths are repo-relative posix. */
export function globToRegExp(glob) {
  if (globCache.has(glob)) return globCache.get(glob);
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        i++;
        if (glob[i + 1] === '/') {
          i++;
          re += '(?:.*/)?';
        } else re += '.*';
      } else re += '[^/]*';
    } else if (c === '?') re += '[^/]';
    else if (c === '{') {
      const end = glob.indexOf('}', i);
      re += `(?:${glob
        .slice(i + 1, end)
        .split(',')
        .map((s) => s.replace(/[.+^$()|[\]\\]/g, '\\$&'))
        .join('|')})`;
      i = end;
    } else re += c.replace(/[.+^$()|[\]\\]/g, '\\$&');
  }
  const rx = new RegExp(`^${re}$`);
  globCache.set(glob, rx);
  return rx;
}

export const matchesAny = (path, globs = []) => globs.some((g) => globToRegExp(g).test(path));

// ---------------------------------------------------------------------------------------------
// Skills / package helpers
// ---------------------------------------------------------------------------------------------

export function listSkills() {
  const dir = join(ROOT, '.claude', 'skills');
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((n) => existsSync(join(dir, n, 'SKILL.md')));
}

export const skillFile = (name) => join(ROOT, '.claude', 'skills', name, 'SKILL.md');

export const packageOf = (path) => PACKAGES.find((p) => path === p || path.startsWith(`${p}/`)) ?? null;

export const insightsFile = (pkg) => (pkg ? join(ROOT, pkg, 'INSIGHTS.md') : null);

/** Bumps automatically when the rubric or the finding schema changes → cache invalidates. */
export function rubricVersion() {
  return sha256(
    readText(join(SKILL_DIR, 'references', 'severity-rubric.md')),
    readText(join(SKILL_DIR, 'references', 'finding-schema.md')),
  ).slice(0, 16);
}

/** True if `line` falls into one of the `[from, to]` ranges. */
export const inRanges = (line, ranges = []) => ranges.some(([a, b]) => line >= a && line <= b);
