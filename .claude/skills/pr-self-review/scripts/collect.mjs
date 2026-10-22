#!/usr/bin/env node
// Step 1: collect the local diff, route files to skills, reuse cached results, plan agent groups.
// Usage: node collect.mjs [--base origin/main] [--mode quick|full]
import { existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import {
  CACHE_FILE, REPO_ROOT, RUN_DIR, addedRanges, computeDiffHash, fileHash, git, loadRouting,
  matchesGlob, mergeBaseOf, parseArgs, readJson, readRepoFile, resolveBase, sha256, skillVersion,
  untrackedFiles, writeJson,
} from './lib.mjs';

const args = parseArgs(process.argv.slice(2));
const mode = args.mode === 'full' ? 'full' : 'quick';
const routing = loadRouting();
const base = resolveBase(args.base);
const mergeBase = mergeBaseOf(base);
const head = git(['rev-parse', 'HEAD']).trim();
const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']).trim();

rmSync(RUN_DIR, { recursive: true, force: true });

// ---------- changed files ----------
const files = new Map();
const nameStatus = git(['diff', '--no-ext-diff', '--name-status', '-z', '-M', mergeBase]).split('\0');
for (let i = 0; i < nameStatus.length - 1; ) {
  const code = nameStatus[i++];
  if (!code) continue;
  if (code[0] === 'R' || code[0] === 'C') {
    const from = nameStatus[i++];
    const path = nameStatus[i++];
    files.set(path, { path, status: 'R', from });
  } else {
    const path = nameStatus[i++];
    files.set(path, { path, status: code[0] });
  }
}
for (const path of untrackedFiles()) files.set(path, { path, status: 'A', untracked: true });

const numstat = new Map();
// -z format: "add\tdel\tpath\0", or for renames "add\tdel\t\0old\0new\0".
const ns = git(['diff', '--no-ext-diff', '--numstat', '-z', '-M', mergeBase]).split('\0');
for (let i = 0; i < ns.length - 1; ) {
  const [add, del, path] = ns[i++].split('\t');
  const target = path === '' ? (i++, ns[i++]) : path;
  if (target !== undefined) numstat.set(target, [Number(add) || 0, Number(del) || 0]);
}

let totalAdded = 0;
let totalDeleted = 0;
for (const f of files.values()) {
  if (f.status === 'D') {
    f.added = [];
  } else if (f.untracked) {
    const text = readRepoFile(f.path) ?? '';
    const n = text.split('\n').length - (text.endsWith('\n') ? 1 : 0);
    f.added = n > 0 ? [[1, n]] : [];
    numstat.set(f.path, [n, 0]);
  } else {
    f.added = addedRanges(mergeBase, f.path);
  }
  const [a, d] = numstat.get(f.path) ?? [0, 0];
  f.linesAdded = a;
  f.linesDeleted = d;
  f.contentHash = fileHash(f.path);
  f.ignored = matchesGlob(f.path, routing.ignorePaths);
  f.skills = f.ignored || f.status === 'D'
    ? []
    : routing.routes
        .filter((r) => (mode === 'full' || !r.fullOnly) && matchesGlob(f.path, r.include) && !matchesGlob(f.path, r.exclude))
        .map((r) => r.skill);
  if (!f.ignored) { totalAdded += a; totalDeleted += d; }
}

// ---------- cache + groups ----------
const cache = readJson(CACHE_FILE, { entries: {} });
const cacheKey = (skill, f) =>
  sha256([skill, skillVersion(skill), mode, f.contentHash, JSON.stringify(f.added)].join('|'));

const toReview = new Map();
const cached = [];
for (const f of files.values()) {
  for (const skill of f.skills) {
    const key = cacheKey(skill, f);
    if (cache.entries[key]) cached.push({ skill, file: f.path, key, findings: cache.entries[key] });
    else {
      if (!toReview.has(skill)) toReview.set(skill, []);
      toReview.get(skill).push({ path: f.path, key });
    }
  }
}

const packageOf = (p) => ['client', 'server', 'reviewer-core', 'e2e'].find((pkg) => p.startsWith(`${pkg}/`)) ?? '.';
const contextFor = (paths) => {
  const ctx = new Set(['CLAUDE.md', 'INSIGHTS.md']);
  for (const p of paths) {
    const pkg = packageOf(p);
    if (pkg !== '.') { ctx.add(`${pkg}/CLAUDE.md`); ctx.add(`${pkg}/INSIGHTS.md`); }
    if (p.startsWith('server/src/modules/repo-intel/')) ctx.add('server/src/modules/repo-intel/INSIGHTS.md');
  }
  return [...ctx].filter((c) => existsSync(join(REPO_ROOT, c)));
};

const groups = [];
for (const [skill, entries] of toReview) {
  for (let i = 0; i < entries.length; i += routing.limits.filesPerAgent) {
    const chunk = entries.slice(i, i + routing.limits.filesPerAgent);
    const id = `g${groups.length + 1}`;
    groups.push({
      id,
      skill,
      skillPath: `.claude/skills/${skill}/SKILL.md`,
      files: chunk.map((c) => c.path),
      cacheKeys: Object.fromEntries(chunk.map((c) => [c.path, c.key])),
      context: contextFor(chunk.map((c) => c.path)),
      output: `.claude/pr-self-review/run/llm-${id}.json`,
    });
  }
}

// ---------- warnings ----------
const routedSkills = new Set(routing.routes.map((r) => r.skill));
const unmappedSkills = readdirSync(join(REPO_ROOT, '.claude/skills'), { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(join(REPO_ROOT, '.claude/skills', d.name, 'SKILL.md')))
  .map((d) => d.name)
  .filter((s) => !routedSkills.has(s) && !routing.notReviewers.includes(s));

const unrouted = [...files.values()]
  .filter((f) => !f.ignored && f.status !== 'D' && f.skills.length === 0 && /\.(tsx?|mjs|js|sql)$/.test(f.path))
  .map((f) => f.path);

const packagesTouched = [...new Set([...files.values()].filter((f) => !f.ignored).map((f) => packageOf(f.path)))]
  .filter((p) => p !== '.');

const warnings = [];
if (totalAdded + totalDeleted > routing.limits.largeDiffLines)
  warnings.push(`Large diff: ${totalAdded + totalDeleted} changed lines (> ${routing.limits.largeDiffLines}). Consider splitting the PR.`);
if (packagesTouched.length >= routing.limits.largeDiffPackages)
  warnings.push(`Diff spans ${packagesTouched.length} packages (${packagesTouched.join(', ')}). Consider splitting the PR.`);
for (const s of unmappedSkills) warnings.push(`Skill "${s}" is not in routing.json — it reviews nothing. Map it or add it to notReviewers.`);
if (files.size === 0) warnings.push(`No changes against ${base}.`);

const plan = {
  createdAt: new Date().toISOString(),
  mode,
  base,
  mergeBase,
  head,
  branch,
  diffHash: computeDiffHash(mergeBase),
  totals: { files: files.size, linesAdded: totalAdded, linesDeleted: totalDeleted, packages: packagesTouched },
  files: [...files.values()],
  groups,
  cached,
  unrouted,
  warnings,
  maxParallelAgents: mode === 'full' ? routing.limits.maxAgentsFull : routing.limits.maxAgentsQuick,
};
writeJson(join(RUN_DIR, 'plan.json'), plan);

// ---------- summary ----------
console.log(`pr-self-review plan (${mode}) — ${branch} vs ${base} @ ${mergeBase.slice(0, 8)}`);
console.log(`files: ${files.size} (+${totalAdded} −${totalDeleted}), packages: ${packagesTouched.join(', ') || '—'}`);
console.log(`agent groups: ${groups.length}, cached skill×file results: ${cached.length}`);
for (const g of groups) console.log(`  ${g.id}  ${g.skill.padEnd(26)} ${g.files.length} file(s)`);
if (unrouted.length) console.log(`no skill (static checks only): ${unrouted.join(', ')}`);
for (const w of warnings) console.log(`WARN ${w}`);
console.log(`plan: .claude/pr-self-review/run/plan.json`);
