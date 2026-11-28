// Shared code for collect.mjs, verdict.mjs and gate.mjs. No dependencies.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SKILL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const MAX_TEXT_BYTES = 1024 * 1024;

export const sha = (data) => createHash('sha256').update(data).digest('hex');

export function git(cwd, args, { allowFail = false } = {}) {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (err) {
    if (allowFail) return null;
    const detail = String(err.stderr || err.message).trim();
    throw new Error(`git ${args.join(' ')} failed: ${detail}`);
  }
}

// ---------------------------------------------------------------- globs

const globCache = new Map();

/** `**`, `*`, `?`, `{a,b}` and `[A-Z]`; a pattern always matches a whole repo-relative path. */
export function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        i++;
        if (glob[i + 1] === '/') {
          i++;
          re += '(?:.*/)?';
        } else {
          re += '.*';
        }
      } else {
        re += '[^/]*';
      }
    } else if (c === '?') {
      re += '[^/]';
    } else if (c === '{') {
      const end = glob.indexOf('}', i);
      const alternatives = glob.slice(i + 1, end).split(',').map(escapeRe);
      re += `(?:${alternatives.join('|')})`;
      i = end;
    } else if (c === '[') {
      const end = glob.indexOf(']', i);
      re += glob.slice(i, end + 1);
      i = end;
    } else {
      re += escapeRe(c);
    }
  }
  return new RegExp(`^${re}$`);
}

function escapeRe(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function matchAny(file, globs = []) {
  for (const glob of globs) {
    let re = globCache.get(glob);
    if (!re) {
      re = globToRegExp(glob);
      globCache.set(glob, re);
    }
    if (re.test(file)) return true;
  }
  return false;
}

// ---------------------------------------------------------------- config

export function loadRouting(skillDir = SKILL_DIR) {
  return JSON.parse(fs.readFileSync(path.join(skillDir, 'routing.json'), 'utf8'));
}

/** Rule ids a reviewer may rate CRITICAL: every `tag/name` id that opens a list item in criticals.md. */
export function loadCriticalIds(skillDir = SKILL_DIR) {
  const file = path.join(skillDir, 'criticals.md');
  if (!fs.existsSync(file)) return new Set();
  const ids = new Set();
  for (const m of fs.readFileSync(file, 'utf8').matchAll(/^\s*-\s*`([a-z0-9-]+\/[a-z0-9-]+)`/gm)) {
    ids.add(m[1]);
  }
  return ids;
}

/** A dotenv file that may hold real keys. Never read, never diffed. */
export function isEnvFile(file) {
  const name = path.basename(file);
  return /^\.env(\..+)?$/.test(name) && !/\.(example|sample|template)$/.test(name);
}

// ---------------------------------------------------------------- snapshot

function resolveBase(root, base, routing) {
  const candidates = base ? [base] : [routing.base, ...(routing.baseFallbacks ?? [])];
  for (const ref of candidates) {
    if (git(root, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], { allowFail: true })) {
      return ref;
    }
  }
  throw new Error(`base ref not found: tried ${candidates.join(', ')}`);
}

function splitZ(output) {
  return output.split('\0').filter(Boolean);
}

function hashEntry(root, entry) {
  if (entry.status === 'D') return 'deleted';
  if (isEnvFile(entry.path)) return 'env-not-read';
  const abs = path.join(root, entry.path);
  let stat;
  try {
    stat = fs.lstatSync(abs);
  } catch {
    return 'missing';
  }
  if (stat.isSymbolicLink()) return sha(`link:${fs.readlinkSync(abs)}`);
  if (!stat.isFile()) return 'not-a-file';
  return sha(fs.readFileSync(abs));
}

export function readText(root, file) {
  if (isEnvFile(file)) return null;
  const abs = path.join(root, file);
  try {
    const stat = fs.statSync(abs);
    if (!stat.isFile() || stat.size > MAX_TEXT_BYTES) return null;
    const buf = fs.readFileSync(abs);
    if (buf.includes(0)) return null;
    return buf.toString('utf8');
  } catch {
    return null;
  }
}

function lensMatches(lens, file, text) {
  if (matchAny(file, lens.exclude)) return false;
  if (matchAny(file, lens.include)) return true;
  const byContent = lens.includeIfContent;
  if (byContent && matchAny(file, byContent.paths)) {
    const content = text();
    return content != null && new RegExp(byContent.pattern, 'm').test(content);
  }
  return false;
}

function lensSources(lens) {
  return lens.skill ? [`.claude/skills/${lens.skill}/SKILL.md`] : (lens.docs ?? []);
}

function sharedHash(skillDir) {
  return ['criticals.md', 'reviewer-prompt.md']
    .map((name) => {
      const file = path.join(skillDir, name);
      return fs.existsSync(file) ? sha(fs.readFileSync(file)) : 'absent';
    })
    .join(':');
}

/**
 * What the branch changes and which lens reviews which file. Cheap: no line
 * ranges, no checks. `key` identifies the reviewed content, so a rebase or an
 * amend that changes no file content keeps it.
 */
export function snapshot({ cwd = process.cwd(), base, routing, skillDir = SKILL_DIR } = {}) {
  routing ??= loadRouting(skillDir);
  const root = git(cwd, ['rev-parse', '--show-toplevel']).trim();
  const gitDir = git(root, ['rev-parse', '--absolute-git-dir']).trim();
  const baseRef = resolveBase(root, base, routing);
  const mergeBase = git(root, ['merge-base', 'HEAD', baseRef]).trim();
  const head = git(root, ['rev-parse', 'HEAD']).trim();

  const tracked = splitZ(git(root, ['diff', '--name-status', '--no-renames', '-z', mergeBase]));
  const entries = [];
  for (let i = 0; i + 1 < tracked.length; i += 2) {
    entries.push({ path: tracked[i + 1], status: tracked[i][0], untracked: false });
  }
  const untracked = splitZ(git(root, ['ls-files', '--others', '--exclude-standard', '-z']));
  for (const file of untracked) {
    if (!file.endsWith('/')) entries.push({ path: file, status: 'A', untracked: true });
  }

  const files = entries
    .filter((entry) => !matchAny(entry.path, routing.exclude))
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((entry) => ({ ...entry, hash: hashEntry(root, entry) }));
  const byPath = new Map(files.map((file) => [file.path, file]));

  const dirty = new Set([
    ...splitZ(git(root, ['diff', '--name-only', '--no-renames', '-z', 'HEAD'])),
    ...untracked,
  ]);
  const uncommitted = files.filter((file) => dirty.has(file.path)).map((file) => file.path);

  const problems = [];
  const routed = new Set();
  const shared = sharedHash(skillDir);
  const groups = [];
  for (const group of routing.groups) {
    const lenses = [];
    for (const lens of group.lenses) {
      const matched = files
        .filter((file) => file.status !== 'D')
        .filter((file) => lensMatches(lens, file.path, () => readText(root, file.path)))
        .map((file) => file.path);
      if (matched.length === 0) continue;
      const sources = lensSources(lens).filter((source) => {
        if (fs.existsSync(path.join(root, source))) return true;
        if (lens.skill) problems.push(`routing.json names ${source}, which does not exist`);
        return false;
      });
      if (lens.skill) for (const file of matched) routed.add(file);
      lenses.push({
        name: lens.skill ?? lens.name ?? 'docs',
        kind: lens.skill ? 'skill' : 'docs',
        read: sources,
        files: matched,
      });
    }
    if (lenses.length === 0) continue;
    const groupFiles = [...new Set(lenses.flatMap((lens) => lens.files))].sort();
    const key = sha(
      JSON.stringify({
        id: group.id,
        shared,
        lenses: lenses.map((lens) => ({
          name: lens.name,
          sources: lens.read.map((source) => sha(fs.readFileSync(path.join(root, source)))),
          files: lens.files.map((file) => [file, byPath.get(file).status, byPath.get(file).hash]),
        })),
      }),
    );
    groups.push({ id: group.id, key, lenses, files: groupFiles });
  }

  const unroutedFiles = files
    .filter((file) => file.status !== 'D' && !routed.has(file.path))
    .map((file) => file.path);

  const skillsRoot = path.join(root, '.claude', 'skills');
  const known = new Set([
    ...routing.groups.flatMap((group) => group.lenses.map((lens) => lens.skill).filter(Boolean)),
    ...(routing.notReviewSkills ?? []),
  ]);
  const unroutedSkills = fs.existsSync(skillsRoot)
    ? fs
        .readdirSync(skillsRoot, { withFileTypes: true })
        .filter((dirent) => dirent.isDirectory())
        .filter((dirent) => fs.existsSync(path.join(skillsRoot, dirent.name, 'SKILL.md')))
        .map((dirent) => dirent.name)
        .filter((name) => !known.has(name))
        .sort()
    : [];

  const key = sha(
    JSON.stringify({
      files: files.map((file) => [file.path, file.status, file.hash]),
      groups: groups.map((group) => group.key),
    }),
  );

  return {
    key,
    root,
    stateDir: path.join(gitDir, 'pr-self-review'),
    base: baseRef,
    mergeBase,
    head,
    files,
    uncommitted,
    groups,
    unroutedFiles,
    unroutedSkills,
    problems,
  };
}

// ---------------------------------------------------------------- state

/** Where verdicts live: inside the git dir, so they are never committed. */
export function locateState(cwd = process.cwd()) {
  const gitDir = git(cwd, ['rev-parse', '--absolute-git-dir']).trim();
  return path.join(gitDir, 'pr-self-review');
}

export function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

export function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

export const statePaths = (stateDir) => ({
  last: path.join(stateDir, 'last.json'),
  manifest: (key) => path.join(stateDir, `manifest-${key}.json`),
  verdict: (key) => path.join(stateDir, `verdict-${key}.json`),
  group: (groupKey) => path.join(stateDir, 'groups', `${groupKey}.json`),
});

export const PASSING = new Set(['PASS', 'PASS_WITH_WARNINGS']);
