#!/usr/bin/env node
/**
 * Step 1–3 of pr-self-review: collect the local diff, route files to skills, drop cached pairs, and
 * write one review task per skill (diff slice + instructions input) for the orchestrator.
 *
 * Usage (from anywhere inside the repo):
 *   node .claude/skills/pr-self-review/scripts/collect-diff.mjs [--base <ref>] [--no-cache]
 *
 * Writes .claude/pr-self-review/run/plan.json and run/tasks/<id>.md. Prints a human summary.
 * Exit 0 always (unless git fails) — the verdict comes from finalize.mjs.
 */
import { existsSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  CACHE_DIR, DEFAULT_BASE, ROOT, RUN_DIR, SKILL_DIR, argValue, computeDiffHash, git, insightsFile,
  listSkills, matchesAny, mergeBase, packageOf, readJson, readText, rubricVersion, sha256, skillFile,
  toPosix, untrackedFiles, writeJson,
} from './lib.mjs';

const args = process.argv.slice(2);
const baseRef = argValue(args, '--base', DEFAULT_BASE);
const noCache = args.includes('--no-cache');

const MAX_HUNK_CHARS = 60_000; // per file in a task slice; the agent reads the file itself beyond that
const MAX_FILE_BYTES = 1_000_000;
const CHUNK_MIN = 40; // files per agent before a skill is split
const MAX_CHUNKS = 3;
const CACHE_TTL_MS = 14 * 24 * 3600 * 1000;

const routing = readJson(join(SKILL_DIR, 'references', 'routing.json'));
const warnings = [];

// ---------------------------------------------------------------------------------------------
// 1. Diff
// ---------------------------------------------------------------------------------------------

const head = git(['rev-parse', 'HEAD']).trim();
const mb = mergeBase(baseRef);
const diffHash = computeDiffHash(mb);

/** path → { path, oldPath?, status } */
const files = new Map();
const nameStatus = git(['diff', '--name-status', '-M', '-z', mb]).split('\0').filter((s) => s !== '');
for (let i = 0; i < nameStatus.length; ) {
  const status = nameStatus[i++];
  if (status.startsWith('R') || status.startsWith('C')) {
    const oldPath = toPosix(nameStatus[i++]);
    const path = toPosix(nameStatus[i++]);
    files.set(path, { path, oldPath, status: status[0] });
  } else {
    const path = toPosix(nameStatus[i++]);
    files.set(path, { path, status: status[0] });
  }
}
for (const path of untrackedFiles()) files.set(path, { path, status: 'A', untracked: true });

/** Split a unified diff into per-file chunks keyed by the new path. */
function splitDiff(text) {
  const out = new Map();
  for (const block of text.split(/^(?=diff --git )/m)) {
    if (!block.startsWith('diff --git')) continue;
    const plus = /^\+\+\+ (?:b\/)?(.+)$/m.exec(block);
    const minus = /^--- (?:a\/)?(.+)$/m.exec(block);
    const name = plus && plus[1] !== '/dev/null' ? plus[1] : minus?.[1];
    if (name) out.set(toPosix(name.replace(/^"|"$/g, '')), block);
  }
  return out;
}

const diffU0 = splitDiff(git(['diff', '-U0', '-M', '--no-color', '--no-ext-diff', mb]));
const diffU3 = splitDiff(git(['diff', '-U3', '-M', '--no-color', '--no-ext-diff', mb]));

function changedLinesFromU0(block = '') {
  const ranges = [];
  const added = [];
  let cur = 0;
  for (const line of block.split('\n')) {
    const m = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (m) {
      const start = Number(m[1]);
      const count = m[2] === undefined ? 1 : Number(m[2]);
      if (count > 0) ranges.push([start, start + count - 1]);
      cur = start;
      continue;
    }
    if (line.startsWith('+') && !line.startsWith('+++')) {
      added.push(line.slice(1));
      cur++;
    }
  }
  return { ranges, added };
}

for (const f of files.values()) {
  const abs = join(ROOT, f.path);
  const exists = existsSync(abs) && statSync(abs).isFile();
  f.deleted = f.status === 'D' || !exists;
  f.package = packageOf(f.path);
  if (f.deleted) {
    f.changedLines = [];
    f.added = [];
    f.hunk = diffU3.get(f.path) ?? '';
    continue;
  }
  const buf = readFileSync(abs);
  f.binary = buf.includes(0) || buf.length > MAX_FILE_BYTES;
  f.content = f.binary ? '' : buf.toString('utf8');
  if (f.untracked) {
    // Count lines the way git does (a trailing newline is not an extra line), so the fileHash — and the
    // cache — stays the same when the file goes from untracked to staged/committed.
    const lines = f.content.split('\n');
    if (lines.length && lines.at(-1) === '') lines.pop();
    f.changedLines = f.binary || !f.content ? [] : [[1, lines.length]];
    f.added = f.binary ? [] : lines;
    f.hunk = f.binary ? '' : `new file (untracked)\n${lines.map((l) => `+${l}`).join('\n')}`;
  } else {
    const { ranges, added } = changedLinesFromU0(diffU0.get(f.path));
    f.changedLines = ranges;
    f.added = added;
    f.hunk = diffU3.get(f.path) ?? '';
  }
  f.fileHash = sha256(buf, JSON.stringify(f.changedLines));
}

// ---------------------------------------------------------------------------------------------
// 2. Routing
// ---------------------------------------------------------------------------------------------

const installed = new Set(listSkills());
const referenced = new Set(routing.rules.flatMap((r) => r.skills));
for (const s of referenced) {
  if (!installed.has(s)) warnings.push(`skill not found: ${s} (in routing.json, missing .claude/skills/${s}/SKILL.md) — skipped`);
}
for (const s of installed) {
  if (!referenced.has(s) && !routing.neverRun.includes(s)) {
    warnings.push(`unrouted skill: ${s} — add it to references/routing.json or to "neverRun"`);
  }
}

const vendoredSkillGlobs = [...installed]
  .filter((s) => !routing.ownSkills.includes(s))
  .map((s) => `.claude/skills/${s}/**`);
const ignoreGlobs = [...routing.ignore, ...vendoredSkillGlobs];

/** skill → [path] */
const bySkill = new Map();
for (const f of files.values()) {
  f.skills = [];
  f.buckets = [];
  if (f.deleted || f.binary || matchesAny(f.path, ignoreGlobs)) continue;
  for (const rule of routing.rules) {
    if (!matchesAny(f.path, rule.files) || matchesAny(f.path, rule.exclude)) continue;
    if (rule.contentMatch && !new RegExp(rule.contentMatch, 'm').test(f.content)) continue;
    if (rule.addedMatch) {
      const rx = new RegExp(rule.addedMatch);
      if (!f.added.some((l) => rx.test(l))) continue;
    }
    for (const s of rule.skills) {
      if (!installed.has(s) || routing.neverRun.includes(s)) continue;
      if (!f.skills.includes(s)) f.skills.push(s);
    }
    if (!f.buckets.includes(rule.bucket)) f.buckets.push(rule.bucket);
  }
  for (const s of f.skills) bySkill.set(s, [...(bySkill.get(s) ?? []), f.path]);
}

// ---------------------------------------------------------------------------------------------
// 3. Cache
// ---------------------------------------------------------------------------------------------

const rubric = rubricVersion();
const skillHash = new Map([...bySkill.keys()].map((s) => [s, sha256(readText(skillFile(s))).slice(0, 16)]));
const insightsHash = (pkg) => sha256(readText(insightsFile(pkg) ?? '')).slice(0, 16);

// prune old cache entries
if (existsSync(CACHE_DIR)) {
  for (const s of readdirSync(CACHE_DIR)) {
    const dir = join(CACHE_DIR, s);
    if (!statSync(dir).isDirectory()) continue;
    for (const e of readdirSync(dir)) {
      const p = join(dir, e);
      if (Date.now() - statSync(p).mtimeMs > CACHE_TTL_MS) rmSync(p, { force: true });
    }
  }
}

const cacheKeyOf = (skill, f) => sha256(skill, f.fileHash, skillHash.get(skill), insightsHash(f.package), rubric).slice(0, 32);

const cached = [];
const pending = new Map(); // skill → [path]
for (const [skill, paths] of bySkill) {
  for (const path of paths) {
    const f = files.get(path);
    const key = cacheKeyOf(skill, f);
    const entry = join(CACHE_DIR, skill, `${key}.json`);
    if (!noCache && existsSync(entry)) {
      cached.push({ skill, file: path, cacheKey: key, findings: readJson(entry).findings ?? [] });
    } else {
      pending.set(skill, [...(pending.get(skill) ?? []), path]);
    }
  }
}

// ---------------------------------------------------------------------------------------------
// 4. Tasks
// ---------------------------------------------------------------------------------------------

rmSync(RUN_DIR, { recursive: true, force: true });
mkdirSync(join(RUN_DIR, 'tasks'), { recursive: true });
mkdirSync(join(RUN_DIR, 'findings'), { recursive: true });
mkdirSync(join(RUN_DIR, 'verify'), { recursive: true });

const fmtRanges = (r) => (r.length ? r.map(([a, b]) => (a === b ? `${a}` : `${a}-${b}`)).join(', ') : '—');

const tasks = [];
for (const [skill, paths] of pending) {
  const size = Math.max(CHUNK_MIN, Math.ceil(paths.length / MAX_CHUNKS));
  for (let i = 0, n = 1; i < paths.length; i += size, n++) {
    const chunk = paths.slice(i, i + size);
    const id = paths.length > size ? `${skill}-${n}` : skill;
    const pkgs = [...new Set(chunk.map((p) => files.get(p).package).filter(Boolean))];
    const insights = pkgs.map((p) => `${p}/INSIGHTS.md`).filter((p) => existsSync(join(ROOT, p)));
    const slice = [
      `# Review slice: ${id}`,
      '',
      `Skill: \`.claude/skills/${skill}/SKILL.md\``,
      `Insights: ${insights.length ? insights.map((p) => `\`${p}\``).join(', ') : 'none'}`,
      `Files: ${chunk.length}`,
      '',
      ...chunk.flatMap((p) => {
        const f = files.get(p);
        const hunk = f.hunk.length > MAX_HUNK_CHARS
          ? `${f.hunk.slice(0, MAX_HUNK_CHARS)}\n… [truncated — Read the file for the rest]`
          : f.hunk;
        return [`## ${p}`, '', `status: ${f.status}${f.untracked ? ' (untracked)' : ''} · changed lines: ${fmtRanges(f.changedLines)}`, '', '```diff', hunk, '```', ''];
      }),
    ].join('\n');
    const slicePath = `.claude/pr-self-review/run/tasks/${id}.md`;
    writeFileSync(join(ROOT, slicePath), slice);
    tasks.push({
      id,
      skill,
      skillPath: `.claude/skills/${skill}/SKILL.md`,
      insights,
      files: chunk,
      cacheKeys: Object.fromEntries(chunk.map((p) => [p, cacheKeyOf(skill, files.get(p))])),
      slicePath,
      outputPath: `.claude/pr-self-review/run/findings/${id}.json`,
    });
  }
}

const plan = {
  createdAt: new Date().toISOString(),
  baseRef,
  mergeBase: mb,
  head,
  diffHash,
  rubricVersion: rubric,
  noCache,
  files: [...files.values()].map(({ path, oldPath, status, untracked, deleted, binary, package: pkg, changedLines, buckets, skills }) => ({
    path, oldPath, status, untracked: !!untracked, deleted, binary: !!binary, package: pkg, changedLines, buckets, skills,
  })),
  tasks,
  cached,
  warnings,
};
writeJson(join(RUN_DIR, 'plan.json'), plan);

// ---------------------------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------------------------

const reviewed = plan.files.filter((f) => f.skills.length).length;
console.log(`pr-self-review · base ${baseRef} (${mb.slice(0, 8)}) · HEAD ${head.slice(0, 8)} · diff ${diffHash.slice(0, 12)}`);
console.log(`changed files: ${files.size} · routed to skills: ${reviewed} · tasks: ${tasks.length} · cached pairs: ${cached.length}`);
if (files.size === 0) console.log('no changes → nothing to review');
const rows = [...bySkill].map(([s, p]) => {
  const c = cached.filter((x) => x.skill === s).length;
  return `  ${s.padEnd(26)} files ${String(p.length).padStart(3)} · cached ${String(c).padStart(3)} · to review ${String(p.length - c).padStart(3)}`;
});
if (rows.length) console.log(`skills:\n${rows.join('\n')}`);
for (const t of tasks) console.log(`task ${t.id} → ${t.slicePath}`);
for (const w of warnings) console.log(`WARN ${w}`);
console.log(`plan: .claude/pr-self-review/run/plan.json`);
