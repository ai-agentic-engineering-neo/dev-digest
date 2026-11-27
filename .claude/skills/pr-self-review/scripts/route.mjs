#!/usr/bin/env node
// Step 2–4 — route changed files to skills, apply the cache, print the budget. Writes run/plan.json.
//   node route.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileDiff, repoRoot } from './lib/git.mjs';
import { routeFiles } from './lib/routing.mjs';
import { SKILL_DIR, readJson, sha256, sha256File, statePaths, writeJson } from './lib/util.mjs';

const root = repoRoot();
const P = statePaths(root);
const manifest = readJson(P.manifest);
const map = readJson(path.join(SKILL_DIR, 'skill-map.json'));

const contentOf = (f) => {
  try {
    return fs.readFileSync(path.join(root, f), 'utf8');
  } catch {
    return null;
  }
};
const { buckets, excluded, unmapped, skipped } = routeFiles(manifest.files, map, contentOf);
const byPath = new Map(manifest.files.map((f) => [f.path, f]));

// Anything that changes what a reviewer would say invalidates the cache.
const promptHash = sha256(
  sha256File(path.join(SKILL_DIR, 'references', 'reviewer-prompt.md')),
  sha256File(path.join(SKILL_DIR, 'references', 'finding-schema.md')),
);

const planned = buckets.map((b) => {
  const def = map.skills[b.skill];
  const skillMd = path.join(root, '.claude', 'skills', b.skill, 'SKILL.md');
  if (!fs.existsSync(skillMd)) throw new Error(`skill-map.json routes to "${b.skill}" but ${skillMd} does not exist`);
  const parts = ['bucket-v1', b.skill, def.model, sha256File(skillMd), promptHash, manifest.base_sha];
  for (const f of [...b.files].sort()) {
    const m = byPath.get(f);
    parts.push(f, sha256File(path.join(root, f)), m.untracked ? 'untracked' : fileDiff(root, manifest.base_sha, f));
  }
  const cacheKey = sha256(...parts);
  return {
    ...b,
    scope: def.scope,
    model: def.model,
    focus: def.focus,
    cache_key: cacheKey,
    cached: fs.existsSync(path.join(P.cache, `bucket-${cacheKey}.json`)),
    output: path.relative(root, path.join(P.findingsDir, `${b.id}.json`)),
  };
});

// Budget = lines that actually go to reviewers (docs, lockfiles etc. are excluded).
const routed = new Set(planned.flatMap((b) => b.files));
const changedLines = manifest.files.filter((f) => routed.has(f.path)).reduce((n, f) => n + f.changed_lines, 0);
const toRun = planned.filter((b) => !b.cached);
const plan = {
  version: 1,
  fingerprint: manifest.fingerprint,
  base_sha: manifest.base_sha,
  buckets: planned,
  excluded,
  unmapped,
  skipped,
  totals: {
    files: manifest.files.length,
    changed_lines: changedLines,
    buckets: planned.length,
    agents_to_run: toRun.length,
    cached: planned.length - toRun.length,
  },
  needs_confirmation: changedLines > (map.confirm_above_lines ?? 5000),
};
writeJson(P.plan, plan);

console.log('| bucket | model | files | changed lines | cache |');
console.log('|---|---|---|---|---|');
for (const b of planned) {
  console.log(`| ${b.id} | ${b.model} | ${b.files.length} | ${b.changed_lines} | ${b.cached ? 'hit' : '—'} |`);
}
console.log(`\n${plan.totals.agents_to_run} reviewer agent(s) to run, ${plan.totals.cached} bucket(s) from cache, ${changedLines} changed line(s) routed to review.`);
if (excluded.length) console.log(`excluded by global_exclude: ${excluded.length} file(s)`);
if (skipped.length) console.log(`skipped (deleted/binary): ${skipped.join(', ')}`);
if (unmapped.length) console.log(`⚠ no skill covers: ${unmapped.join(', ')}`);
if (plan.needs_confirmation) {
  console.log(`\n⚠ diff is larger than ${map.confirm_above_lines} changed lines — ask the user to confirm before launching agents.`);
}
console.log(`\nplan → ${P.plan}`);
