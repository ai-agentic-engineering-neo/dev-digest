#!/usr/bin/env node
// Which packages did this session touch? Combines the session transcript (Edit/Write calls)
// with `git status` (edits made through Bash). Usage:
//   node .claude/skills/engineering-insights/scripts/touched-packages.mjs [--transcript <file.jsonl>]
import { PACKAGES, repoRoot, packageOf, findTranscript, parseTranscript, gitChangedFiles } from './lib.mjs';
import { relative, isAbsolute } from 'node:path';

const root = repoRoot();
const argIdx = process.argv.indexOf('--transcript');
const transcript = argIdx > -1 ? process.argv[argIdx + 1] : findTranscript(root);

const byPkg = new Map(PACKAGES.map((p) => [p, { session: new Set(), sinceLastRun: new Set(), git: new Set() }]));
const rel = (p) => (isAbsolute(p) ? relative(root, p) : p);

let lastRun = null;
if (transcript) {
  const parsed = parseTranscript(transcript);
  lastRun = parsed.lastRun;
  for (const { path, at } of parsed.edits) {
    const pkg = packageOf(path, root);
    if (!pkg) continue;
    byPkg.get(pkg).session.add(rel(path));
    if (!lastRun || (at && at > lastRun)) byPkg.get(pkg).sinceLastRun.add(rel(path));
  }
}
for (const file of gitChangedFiles(root)) {
  const pkg = packageOf(file, root);
  if (pkg) byPkg.get(pkg).git.add(file);
}

console.log(`transcript: ${transcript ?? 'not found'}`);
console.log(`engineering-insights last ran this session: ${lastRun ?? 'never'}`);
let any = false;
for (const [pkg, { session, sinceLastRun, git }] of byPkg) {
  if (!session.size && !git.size) continue;
  any = true;
  console.log(`\n${pkg}  → ${pkg}/INSIGHTS.md`);
  for (const f of session) console.log(`  session${sinceLastRun.has(f) ? ' (new since last run)' : ''}: ${f}`);
  for (const f of git) if (!session.has(f)) console.log(`  working tree (may predate this session): ${f}`);
}
if (!any) console.log('\nno package files touched — nothing to capture unless the session discovered something by reading code');
