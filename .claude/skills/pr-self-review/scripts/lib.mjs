// Shared helpers for pr-self-review scripts. Node >= 20, no dependencies.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SKILL_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');

export function git(args, opts = {}) {
  return execFileSync('git', args, {
    cwd: opts.cwd ?? REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    stdio: ['ignore', 'pipe', opts.quiet ? 'ignore' : 'pipe'],
  });
}

export const REPO_ROOT = execFileSync('git', ['rev-parse', '--show-toplevel'], {
  cwd: SKILL_DIR,
  encoding: 'utf8',
}).trim();

/** Results live outside the skill folder and are gitignored. */
export const STATE_DIR = join(REPO_ROOT, '.claude', 'pr-self-review');
export const RUN_DIR = join(STATE_DIR, 'run');
export const LAST_RUN = join(STATE_DIR, 'last-run.json');
export const CACHE_FILE = join(STATE_DIR, 'cache.json');
export const STATUS_CONTEXT = 'pr-self-review';

export const sha256 = (s) => createHash('sha256').update(s).digest('hex');

export function readJson(path, fallback) {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function writeJson(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n');
}

export function loadRouting() {
  return readJson(join(SKILL_DIR, 'routing.json'));
}

export function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) out._.push(a);
    else if (a.includes('=')) out[a.slice(2, a.indexOf('='))] = a.slice(a.indexOf('=') + 1);
    else if (argv[i + 1] && !argv[i + 1].startsWith('--')) out[a.slice(2)] = argv[++i];
    else out[a.slice(2)] = true;
  }
  return out;
}

// ---------- glob ----------

function expandBraces(pattern) {
  const m = pattern.match(/\{([^{}]*)\}/);
  if (!m) return [pattern];
  return m[1]
    .split(',')
    .flatMap((alt) => expandBraces(pattern.slice(0, m.index) + alt + pattern.slice(m.index + m[0].length)));
}

function globToRegex(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') {
      // `**/` matches zero or more folders; a trailing `**` matches anything.
      if (glob[i + 2] === '/') { re += '(?:.*/)?'; i += 2; } else { re += '.*'; i += 1; }
    } else if (c === '*') re += '[^/]*';
    else if (c === '?') re += '[^/]';
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}

const globCache = new Map();
export function matchesGlob(path, patterns = []) {
  return patterns.some((p) => {
    if (!globCache.has(p)) globCache.set(p, expandBraces(p).map(globToRegex));
    return globCache.get(p).some((re) => re.test(path));
  });
}

// ---------- diff ----------

export function resolveBase(explicit) {
  const candidates = explicit ? [explicit] : ['origin/main', 'main'];
  for (const ref of candidates) {
    try {
      git(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], { quiet: true });
      return ref;
    } catch {}
  }
  throw new Error(`Base ref not found (tried ${candidates.join(', ')}). Pass --base <ref>.`);
}

export function mergeBaseOf(base) {
  return git(['merge-base', base, 'HEAD']).trim();
}

export function untrackedFiles() {
  return git(['ls-files', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean);
}

/**
 * Hash of everything that would end up in the PR: committed + staged + unstaged
 * changes against the merge-base, plus untracked files. Any edit changes it.
 */
export function computeDiffHash(mergeBase) {
  const tracked = git(['diff', '--no-ext-diff', '--no-color', '--binary', mergeBase]);
  const untracked = untrackedFiles()
    .sort()
    .map((p) => `${p}\0${fileHash(p)}`)
    .join('\n');
  return sha256(`${mergeBase}\n${tracked}\n--untracked--\n${untracked}`);
}

export function fileHash(relPath) {
  const abs = join(REPO_ROOT, relPath);
  let st;
  try { st = lstatSync(abs); } catch { return 'deleted'; }
  if (st.isSymbolicLink()) return sha256(`link:${readlinkSync(abs)}`);
  return st.isFile() ? sha256(readFileSync(abs)) : 'not-a-file';
}

/** Text content of a regular file, or null (missing, directory, symlink, binary). */
export function readRepoFile(relPath) {
  const abs = join(REPO_ROOT, relPath);
  try {
    if (!lstatSync(abs).isFile()) return null;
  } catch {
    return null;
  }
  const text = readFileSync(abs, 'utf8');
  return text.includes('\0') ? null : text;
}

export function showAt(rev, relPath) {
  try {
    return git(['show', `${rev}:${relPath}`], { quiet: true });
  } catch {
    return null;
  }
}

/** Added line ranges ([start, end], 1-based, inclusive) in the working-tree version of a file. */
export function addedRanges(mergeBase, relPath) {
  const out = git(['diff', '--no-ext-diff', '--no-color', '-U0', mergeBase, '--', relPath]);
  const ranges = [];
  for (const m of out.matchAll(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm)) {
    const start = Number(m[1]);
    const count = m[2] === undefined ? 1 : Number(m[2]);
    if (count > 0) ranges.push([start, start + count - 1]);
  }
  return ranges;
}

export function inRanges(line, ranges, endLine = line) {
  return ranges.some(([s, e]) => line <= e && endLine >= s);
}

/** Skill content hash — a skill edit invalidates its cached findings. */
export function skillVersion(skill) {
  const files = [join(REPO_ROOT, '.claude/skills', skill, 'SKILL.md'),
    join(SKILL_DIR, 'references/severity-rubric.md'),
    join(SKILL_DIR, 'references/reviewer-prompt.md')];
  return sha256(files.map((f) => (existsSync(f) ? readFileSync(f, 'utf8') : '')).join('\0')).slice(0, 16);
}
