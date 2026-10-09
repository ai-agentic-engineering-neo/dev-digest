// Shared helpers for the engineering-insights skill. Zero dependencies (Node >= 22).
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join, relative, isAbsolute, basename } from 'node:path';

export const PACKAGES = ['server', 'client', 'reviewer-core', 'e2e'];

export const SECTIONS = [
  'What Works',
  "What Doesn't Work",
  'Codebase Patterns',
  'Tool & Library Notes',
  'Recurring Errors & Fixes',
  'Session Notes',
  'Open Questions',
];

export const SKILL_NAME = 'engineering-insights';
const EDIT_TOOLS = new Set(['Edit', 'MultiEdit', 'Write', 'NotebookEdit']);
const ENTRY_LIMIT = 200;

export function repoRoot(cwd = process.cwd()) {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd, encoding: 'utf8' }).trim();
  } catch {
    return cwd;
  }
}

/** Package a repo path belongs to, or null (root files, runtime clones, node_modules, INSIGHTS.md). */
export function packageOf(path, root = repoRoot()) {
  const rel = (isAbsolute(path) ? relative(root, path) : path).split('\\').join('/');
  if (rel.startsWith('..')) return null;
  const [pkg] = rel.split('/');
  if (!PACKAGES.includes(pkg) || rel === pkg) return null;
  if (rel.startsWith('server/clones/') || rel.includes('/node_modules/')) return null;
  if (basename(rel) === 'INSIGHTS.md') return null;
  return pkg;
}

/** Newest transcript of the project at `root` (Claude Code stores them per sanitized cwd). */
export function findTranscript(root = repoRoot()) {
  const dir = join(homedir(), '.claude', 'projects', root.replace(/[^a-zA-Z0-9]/g, '-'));
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.jsonl'))
    .map((f) => join(dir, f))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  return files[0] ?? null;
}

function isSkillRun(entry) {
  const content = entry.message?.content;
  if (entry.type === 'assistant' && Array.isArray(content)) {
    return content.some(
      (b) => b?.type === 'tool_use' && b.name === 'Skill' &&
        String(b.input?.skill ?? '').replace(/^.*:/, '') === SKILL_NAME,
    );
  }
  if (entry.type === 'user') {
    const text = typeof content === 'string' ? content : JSON.stringify(content ?? '');
    return text.includes(`<command-name>/${SKILL_NAME}</command-name>`);
  }
  return false;
}

/**
 * Files edited through Edit/Write tools in a transcript, plus when this skill last ran.
 * Returns { edits: [{ path, at }], lastRun: ISO string | null }.
 */
export function parseTranscript(path) {
  const edits = [];
  let lastRun = null;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (isSkillRun(entry)) lastRun = entry.timestamp ?? lastRun;
    const content = entry.message?.content;
    if (entry.type !== 'assistant' || !Array.isArray(content)) continue;
    for (const b of content) {
      if (b?.type !== 'tool_use' || !EDIT_TOOLS.has(b.name)) continue;
      const file = b.input?.file_path ?? b.input?.notebook_path;
      if (file) edits.push({ path: file, at: entry.timestamp ?? null });
    }
  }
  return { edits, lastRun };
}

/** Changed + untracked files from `git status` (catches edits made through Bash). */
export function gitChangedFiles(root = repoRoot()) {
  let out;
  try {
    out = execFileSync('git', ['status', '--porcelain=v1', '-z', '--untracked-files=all'], {
      cwd: root,
      encoding: 'utf8',
    });
  } catch {
    return [];
  }
  const parts = out.split('\0');
  const files = [];
  for (let i = 0; i < parts.length; i++) {
    const rec = parts[i];
    if (rec.length < 4) continue;
    files.push(rec.slice(3));
    if (rec[0] === 'R' || rec[0] === 'C') i++; // next record is the rename source
  }
  return files;
}

/** Lines of `base` must appear in `next` in the same order (new lines may be inserted anywhere). */
export function checkAppendOnly(base, next) {
  const want = base.split('\n');
  const have = next.split('\n');
  let j = 0;
  for (let i = 0; i < want.length; i++) {
    while (j < have.length && have[j] !== want[i]) j++;
    if (j === have.length) return { ok: false, missing: want[i], line: i + 1 };
    j++;
  }
  return { ok: true };
}

const normTitle = (h) =>
  h.replace(/^###\s+/, '').replace(/^\d{4}-\d{2}-\d{2}\s*[—–-]\s*/, '').trim().toLowerCase();

/** Structural checks on an INSIGHTS.md: sections present and ordered, no duplicate titles. */
export function checkStructure(text) {
  const problems = [];
  const warnings = [];
  const lines = text.split('\n');
  let inFence = false;
  const headings = [];
  const titles = new Map();
  lines.forEach((l, i) => {
    if (l.startsWith('```')) inFence = !inFence;
    if (inFence) return;
    if (l.startsWith('## ')) headings.push(l.slice(3).trim());
    if (l.startsWith('### ')) {
      const t = normTitle(l);
      if (titles.has(t)) problems.push(`duplicate entry title "${l.slice(4)}" (lines ${titles.get(t)} and ${i + 1})`);
      else titles.set(t, i + 1);
    }
  });
  const order = SECTIONS.map((s) => headings.indexOf(s));
  SECTIONS.forEach((s, k) => {
    if (order[k] === -1) problems.push(`missing section "## ${s}"`);
  });
  const present = order.filter((x) => x !== -1);
  if (present.some((x, k) => k > 0 && x < present[k - 1])) problems.push('sections are out of order');
  if (titles.size > ENTRY_LIMIT) {
    warnings.push(`${titles.size} entries (> ${ENTRY_LIMIT}) — signal/noise drops; ask a human to review and prune`);
  }
  return { problems, warnings, entries: titles.size };
}

/** Baseline content of a file: git index first, then HEAD; null when git has never seen it. */
export function gitBaseline(relPath, root = repoRoot()) {
  for (const spec of [`:${relPath}`, `HEAD:${relPath}`]) {
    try {
      return execFileSync('git', ['show', spec], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    } catch {
      // try the next source
    }
  }
  return null;
}
